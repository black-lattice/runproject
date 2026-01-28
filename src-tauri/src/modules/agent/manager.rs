use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use super::tools::default_auto_approve;
use super::types::{AgentMessage, AgentSession, AgentSessionRecord, AgentSettings, ApprovalState, PendingAction};
use super::state::SESSIONS;
use super::utils::{emit_event, now_ms};
use super::settings::{load_settings, save_settings};
use super::mcp::{agent_get_mcp_config as mcp_get_config, agent_save_mcp_config as mcp_save_config};
use super::llm::stream::stream_agent_response;

#[tauri::command]
pub fn agent_get_settings(app: AppHandle) -> Result<AgentSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn agent_save_settings(app: AppHandle, settings: AgentSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}

#[tauri::command]
pub fn agent_get_mcp_config(app: AppHandle) -> Result<String, String> {
    mcp_get_config(app)
}

#[tauri::command]
pub fn agent_save_mcp_config(app: AppHandle, config: String) -> Result<(), String> {
    mcp_save_config(app, config)
}

#[tauri::command]
pub fn agent_start_session(
    app: AppHandle,
    session_id: String,
    workspace: String,
) -> Result<String, String> {
    let workspace_path = validate_workspace(&workspace)?;
    let session_file = create_session_file(&app, &session_id, &workspace)?;

    let approvals = Arc::new(ApprovalState {
        next_id: std::sync::atomic::AtomicU64::new(1),
        pending: Mutex::new(HashMap::new()),
        auto_approve: Mutex::new(default_auto_approve()),
    });

    let history = load_session_history(&session_file).unwrap_or_default();

    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    sessions.insert(
        session_id.clone(),
        AgentSession {
            workspace: workspace_path,
            session_file,
            history,
            approvals,
            mcp_clients: Arc::new(Mutex::new(HashMap::new())),
        },
    );

    emit_event(&app, &session_id, "session-start", None);
    Ok(session_id)
}

#[tauri::command]
pub fn agent_stop_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    if let Some(session) = sessions.remove(&session_id) {
        if let Ok(mcp_clients) = session.mcp_clients.lock() {
            println!("[AGENT] Cleaning up {} MCP clients for session {}", mcp_clients.len(), session_id);
            for (name, client) in mcp_clients.iter() {
                println!("[AGENT] Terminating MCP server: {}", name);
                let _ = client.terminate();
            }
        }
    }
    emit_event(&app, &session_id, "session-stop", None);
    Ok(())
}

#[tauri::command]
pub fn agent_send_message(app: AppHandle, session_id: String, content: String) -> Result<(), String> {
    let (workspace, approvals, history_snapshot) = {
        let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "会话不存在".to_string())?;

        let history_snapshot = session.history.clone();

        let user_message = AgentMessage {
            role: "user".to_string(),
            content: content.clone(),
            reasoning: None,
            timestamp_ms: now_ms(),
        };
        session.history.push(user_message);
        save_session_record(&app, &session_id, session)?;

        (
            session.workspace.clone(),
            session.approvals.clone(),
            history_snapshot,
        )
    };

    let app_clone = app.clone();
    let app_for_error = app.clone();
    let session_id_for_error = session_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = stream_agent_response(
            app_clone,
            session_id.clone(),
            content,
            workspace,
            approvals,
            history_snapshot,
        )
        .await
        {
            emit_event(
                &app_for_error,
                &session_id_for_error,
                "error",
                Some(serde_json::json!({ "error": error })),
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub fn agent_approve_action(
    app: AppHandle,
    session_id: String,
    call_id: u64,
    decision: String,
    remember: bool,
) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "会话不存在".to_string())?;

    let approved = decision.to_lowercase() == "approve" || decision.to_lowercase() == "yes";

    let action = {
        let mut pending = session
            .approvals
            .pending
            .lock()
            .map_err(|_| "获取审批队列失败".to_string())?;
        pending.remove(&call_id)
    };

    if let Some(PendingAction { action_type, responder, .. })
        = action
    {
        if remember && approved {
            if let Ok(mut map) = session.approvals.auto_approve.lock() {
                map.insert(action_type.clone(), true);
            }
        }
        let _ = responder.send(approved);
        emit_event(
            &app,
            &session_id,
            if approved {
                "action-approved"
            } else {
                "action-rejected"
            },
            Some(serde_json::json!({ "callId": call_id, "actionType": action_type })),
        );
    }

    Ok(())
}

fn create_session_file(app: &AppHandle, session_id: &str, workspace: &str) -> Result<PathBuf, String> {
    let dir = session_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let file_path = dir.join(format!("session-{}.json", session_id));
    if !file_path.exists() {
        let settings = load_settings(app)?;
        let record = AgentSessionRecord {
            id: session_id.to_string(),
            created_at_ms: now_ms(),
            workspace: workspace.to_string(),
            provider: settings.provider,
            model: settings.model,
            messages: Vec::new(),
        };
        let content = serde_json::to_string_pretty(&record).map_err(|e| format!("序列化会话失败: {}", e))?;
        fs::write(&file_path, content).map_err(|e| format!("写入会话失败: {}", e))?;
    }
    Ok(file_path)
}

fn load_session_history(path: &Path) -> Option<Vec<AgentMessage>> {
    let content = fs::read_to_string(path).ok()?;
    let record: AgentSessionRecord = serde_json::from_str(&content).ok()?;
    Some(record.messages)
}

fn save_session_record(app: &AppHandle, session_id: &str, session: &AgentSession) -> Result<(), String> {
    let settings = load_settings(app).unwrap_or_default();
    let record = AgentSessionRecord {
        id: session_id.to_string(),
        created_at_ms: now_ms(),
        workspace: session.workspace.to_string_lossy().to_string(),
        provider: settings.provider,
        model: settings.model,
        messages: session.history.clone(),
    };
    let content = serde_json::to_string_pretty(&record).map_err(|e| format!("序列化会话失败: {}", e))?;
    fs::write(&session.session_file, content).map_err(|e| format!("保存会话失败: {}", e))?;
    Ok(())
}

fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("agent_sessions"))
}

fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() { return Err(format!("工作目录不存在: {}", path.display())); }
    let canonical = path.canonicalize().map_err(|e| format!("工作目录无法解析: {}", e))?;
    Ok(canonical)
}