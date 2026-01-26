use super::event_handler::{emit_event, emit_status, handle_incoming_message};
use super::session::CodexSession;
use super::types::{CodexStatus, PendingAction};
use lazy_static::lazy_static;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

lazy_static! {
    static ref SESSIONS: Arc<Mutex<HashMap<String, CodexSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
pub fn codex_start_session(
    app: AppHandle,
    session_id: String,
    workspace: String,
    cli_path: Option<String>,
    cli_args: Option<Vec<String>>,
) -> Result<String, String> {
    let workspace_path = validate_workspace(&workspace)?;

    {
        let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
        if sessions.contains_key(&session_id) {
            return Err(format!("会话已存在: {}", session_id));
        }
    }

    emit_status(&app, &session_id, CodexStatus::Connecting, None);

    let pending_actions = Arc::new(Mutex::new(HashMap::new()));
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let workspace_clone = workspace_path.clone();
    let pending_clone = pending_actions.clone();

    let on_message = Arc::new(move |message| {
        handle_incoming_message(
            &app_clone,
            &session_id_clone,
            &workspace_clone,
            &pending_clone,
            message,
        );
    });

    let app_stderr = app.clone();
    let stderr_session = session_id.clone();
    let on_stderr = Arc::new(move |text: String| {
        emit_event(
            &app_stderr,
            &stderr_session,
            "stderr",
            Some(serde_json::json!({ "text": text })),
        );
    });

    let cli_path = cli_path.unwrap_or_else(|| "codex".to_string());
    let cli_args = cli_args.unwrap_or_else(|| vec!["mcp".to_string(), "serve".to_string()]);

    let session = CodexSession::new(
        session_id.clone(),
        workspace_path,
        &cli_path,
        &cli_args,
        pending_actions,
        on_message,
        on_stderr,
    )?;

    emit_status(&app, &session_id, CodexStatus::Connected, None);
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    sessions.insert(session_id.clone(), session);

    Ok(session_id)
}

#[tauri::command]
pub fn codex_send_message(
    session_id: String,
    content: String,
    files: Option<Vec<String>>,
) -> Result<u64, String> {
    let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;

    let params = serde_json::json!({
        "content": content,
        "files": files,
    });

    session
        .connection
        .send_request("codex.send_message", Some(params))
}

#[tauri::command]
pub fn codex_approve_action(
    app: AppHandle,
    session_id: String,
    call_id: u64,
    decision: String,
) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;

    let approved = decision.to_lowercase() == "approve" || decision.to_lowercase() == "yes";

    let action = session
        .pending_actions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&call_id);

    if let Some(action) = action {
        if approved {
            match action {
                PendingAction::Patch { patch } => {
                    apply_patch(&session.workspace, &patch)?;
                    emit_event(
                        &app,
                        &session_id,
                        "patch-applied",
                        Some(serde_json::json!({ "callId": call_id })),
                    );
                }
                PendingAction::Command {
                    command,
                    working_dir,
                } => {
                    let working_dir = resolve_working_dir(&session.workspace, &working_dir)?;
                    emit_event(
                        &app,
                        &session_id,
                        "command-approved",
                        Some(serde_json::json!({
                            "callId": call_id,
                            "command": command,
                            "workingDir": working_dir.to_string_lossy(),
                        })),
                    );
                }
                PendingAction::Other { .. } => {
                    emit_event(
                        &app,
                        &session_id,
                        "action-approved",
                        Some(serde_json::json!({ "callId": call_id })),
                    );
                }
            }
        } else {
            emit_event(
                &app,
                &session_id,
                "action-rejected",
                Some(serde_json::json!({ "callId": call_id })),
            );
        }
    }

    let result = serde_json::json!({ "approved": approved });
    session.connection.send_response(call_id, result)?;
    Ok(())
}

#[tauri::command]
pub fn codex_stop_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    if let Some(session) = sessions.remove(&session_id) {
        session.connection.terminate()?;
    }
    emit_status(&app, &session_id, CodexStatus::Closed, None);
    Ok(())
}

fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("workspace 不存在: {}", path.display()));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("workspace 无法解析: {}", e))?;
    Ok(canonical)
}

fn resolve_working_dir(workspace: &Path, requested: &Path) -> Result<PathBuf, String> {
    let resolved = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        workspace.join(requested)
    };
    let canonical = resolved
        .canonicalize()
        .map_err(|e| format!("工作目录无效: {}", e))?;

    if !canonical.starts_with(workspace) {
        return Err("工作目录超出 workspace 范围".to_string());
    }

    Ok(canonical)
}

fn apply_patch(workspace: &Path, patch: &str) -> Result<(), String> {
    if patch.trim().is_empty() {
        return Err("patch 为空".to_string());
    }

    validate_patch_paths(patch)?;

    let temp_dir = std::env::temp_dir();
    let patch_path = temp_dir.join(format!("codex_patch_{}.diff", now_ms()));

    fs::write(&patch_path, patch).map_err(|e| format!("写入 patch 失败: {}", e))?;

    let git_result = std::process::Command::new("git")
        .arg("apply")
        .arg(&patch_path)
        .current_dir(workspace)
        .output();

    let applied = match git_result {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git apply 失败: {}", stderr.trim()));
        }
        Err(_) => false,
    };

    if !applied {
        let patch_result = std::process::Command::new("patch")
            .arg("-p0")
            .arg("-i")
            .arg(&patch_path)
            .current_dir(workspace)
            .output();

        match patch_result {
            Ok(output) if output.status.success() => {}
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("patch 应用失败: {}", stderr.trim()));
            }
            Err(e) => return Err(format!("patch 执行失败: {}", e)),
        }
    }

    let _ = fs::remove_file(&patch_path);
    Ok(())
}

fn validate_patch_paths(patch: &str) -> Result<(), String> {
    for line in patch.lines() {
        if let Some(path) = line.strip_prefix("+++ ").or_else(|| line.strip_prefix("--- ")) {
            let path = path.trim();
            if path.starts_with('/') || path.contains("..") {
                return Err(format!("patch 路径不安全: {}", path));
            }
            if path.contains(":\\") {
                return Err(format!("patch 路径不安全: {}", path));
            }
        }
    }
    Ok(())
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}
