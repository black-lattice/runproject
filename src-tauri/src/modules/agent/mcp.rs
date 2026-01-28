use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use crate::modules::codex::connection::{CodexConnection, Framing};
use super::types::AgentSession;

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

pub fn ensure_mcp_clients(
    app: &AppHandle,
    session: &AgentSession,
) -> Result<HashMap<String, Vec<Value>>, String> {
    let config_str = agent_get_mcp_config(app.clone())?;
    let config: McpConfig =
        serde_json::from_str(&config_str).map_err(|e| format!("解析 MCP 配置失败: {}", e))?;

    let mut clients = session
        .mcp_clients
        .lock()
        .map_err(|_| "获取 MCP 锁失败".to_string())?;
    let mut all_tools = HashMap::new();

    for (name, server_config) in config.mcp_servers {
        if !clients.contains_key(&name) {
            println!("[AGENT] Starting MCP server: {}", name);
            let on_message = Arc::new(|_| {});
            let name_for_err = name.clone();
            let on_stderr = Arc::new(move |err| {
                println!("[AGENT] MCP server {} stderr: {}", name_for_err, err);
            });

            let mut cmd = std::process::Command::new(&server_config.command);
            cmd.args(&server_config.args);

            if let Some(env_map) = &server_config.env {
                for (k, v) in env_map {
                    cmd.env(k, v);
                }
            }

            match CodexConnection::spawn_from_command(
                cmd,
                Framing::Line,
                on_message,
                on_stderr,
            ) {
                Ok(client) => {
                    let handshake_result = (|| -> Result<(), String> {
                        if let Err(e) = client.wait_for_server_ready(Duration::from_secs(10)) {
                            println!("[AGENT] MCP server {} not responding to ping, attempting initialize anyway: {}", name, e);
                        }
                        
                        let init_params = serde_json::json!({
                            "protocolVersion": "2024-11-05",
                            "capabilities": {},
                            "clientInfo": { "name": "runproject-agent", "version": "1.0.0" }
                        });
                        
                        client.send_request_and_wait(
                            "initialize",
                            Some(init_params),
                            Duration::from_secs(10),
                        )?;
                        client.send_notification("initialized", None)?;
                        Ok(())
                    })();

                    if let Err(e) = handshake_result {
                        println!("[AGENT] MCP server {} handshake failed: {}. This server will be skipped.", name, e);
                        let _ = client.terminate();
                        continue;
                    }

                    clients.insert(name.clone(), client);
                },
                Err(e) => {
                    println!("[AGENT] Failed to spawn MCP server {}: {}. Skipping.", name, e);
                    continue;
                }
            }
        }

        // Fetch tools for successfully connected clients
        if let Some(client) = clients.get(&name) {
            let mut tools_result = client.send_request_and_wait("tools/list", None, Duration::from_secs(5));
            
            // Retry once if failed
            if tools_result.is_err() {
                std::thread::sleep(Duration::from_millis(500));
                tools_result = client.send_request_and_wait("tools/list", None, Duration::from_secs(5));
            }

            if let Ok(result) = tools_result {
                if let Some(tools) = result.get("tools").and_then(|t| t.as_array()) {
                    println!("[AGENT] MCP server {} provided {} tools", name, tools.len());
                    all_tools.insert(name.clone(), tools.clone());
                }
            } else {
                println!("[AGENT] Failed to fetch tools from {}: {:?}", name, tools_result.err());
            }
        }
    }

    let all_names: Vec<String> = all_tools.values().flat_map(|v| v.iter().filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))).collect();
    println!("[AGENT] Total discovery: {} MCP tools: {:?}", all_names.len(), all_names);

    Ok(all_tools)
}
