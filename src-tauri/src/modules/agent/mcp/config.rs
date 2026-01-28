use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

pub fn mcp_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("mcp_config.json"))
}

pub fn agent_get_mcp_config(app: AppHandle) -> Result<String, String> {
    let path = mcp_config_path(&app)?;
    if !path.exists() {
        let default_config = serde_json::json!({
            "mcpServers": {}
        });
        return Ok(serde_json::to_string_pretty(&default_config).unwrap());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))
}

pub fn agent_save_mcp_config(app: AppHandle, config: String) -> Result<(), String> {
    let _: Value = serde_json::from_str(&config).map_err(|e| format!("无效的 JSON 格式: {}", e))?;
    let path = mcp_config_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    fs::write(&path, config).map_err(|e| format!("写入 MCP 配置失败: {}", e))?;
    Ok(())
}
