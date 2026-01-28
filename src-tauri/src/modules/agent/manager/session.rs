use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use super::super::types::{AgentMessage, AgentSession, AgentSessionRecord};
use super::super::utils::now_ms;
use super::super::settings::load_settings;

pub fn create_session_file(app: &AppHandle, session_id: &str, workspace: &str) -> Result<PathBuf, String> {
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

pub fn load_session_history(path: &Path) -> Option<Vec<AgentMessage>> {
    let content = fs::read_to_string(path).ok()?;
    let record: AgentSessionRecord = serde_json::from_str(&content).ok()?;
    Some(record.messages)
}

pub fn save_session_record(app: &AppHandle, session_id: &str, session: &AgentSession) -> Result<(), String> {
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

pub fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("agent_sessions"))
}
