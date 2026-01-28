use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use super::types::AgentSettings;

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<AgentSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        let settings = AgentSettings::default();
        save_settings(app, &settings)?;
        return Ok(settings);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取设置失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {}", e))
}

pub fn save_settings(app: &AppHandle, settings: &AgentSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建设置目录失败: {}", e))?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入设置失败: {}", e))?;
    Ok(())
}
