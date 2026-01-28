use std::collections::HashMap;
use std::time::Duration;
use serde_json::Value;
use crate::modules::agent::tools::{
    ToolContext, batch_ops, delete_path, list_dir, mkdir, move_path, read_file, write_file,
};
use crate::modules::agent::state::SESSIONS;

pub async fn call_tool(ctx: &ToolContext, name: &str, args_json: &str, mcp_tools_map: &HashMap<String, Vec<Value>>) -> Result<Value, String> {
    let args_value = parse_tool_args(args_json)?;
    match name {
        "read_file" => read_file(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "list_dir" => list_dir(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "write_file" => write_file(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "delete_path" => delete_path(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "mkdir" => mkdir(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "move_path" => move_path(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "batch_file_ops" => batch_ops(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        _ => {
            let mut target_server = None;
            let mut target_tool_name = None;

            for (server_name, mcp_tools) in mcp_tools_map {
                if mcp_tools.iter().any(|t| t.get("name").and_then(|v| v.as_str()) == Some(name)) {
                    target_server = Some(server_name);
                    target_tool_name = Some(name.to_string());
                    break;
                }
            }

            if target_server.is_none() {
                 for (server_name, mcp_tools) in mcp_tools_map {
                    if let Some(tool) = mcp_tools.iter().find(|t| t.get("name").and_then(|v| v.as_str()).map(|s| s.eq_ignore_ascii_case(name)).unwrap_or(false)) {
                        target_server = Some(server_name);
                        target_tool_name = tool.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
                        break;
                    }
                }
            }

            if let (Some(server_name), Some(real_name)) = (target_server, target_tool_name) {
                let sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
                let session = sessions.get(&ctx.session_id).ok_or_else(|| "会话不存在".to_string())?;
                let mcp_clients = session.mcp_clients.lock().map_err(|_| "获取 MCP 锁失败".to_string())?;
                let client = mcp_clients.get(server_name).ok_or_else(|| format!("MCP 服务器 {} 未连接", server_name))?;
                let params = serde_json::json!({"name": real_name, "arguments": args_value});
                return client.send_request_and_wait("tools/call", Some(params), Duration::from_secs(300));
            }

            let available: Vec<String> = mcp_tools_map.values()
                .flat_map(|tools| tools.iter().filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())))
                .collect();
            Err(format!("未知工具: {} (Available: {:?})", name, available))
        }
    }
}

fn parse_tool_args(args_json: &str) -> Result<Value, String> {
    let trimmed = args_json.trim();
    if trimmed.is_empty() { return Ok(Value::Object(serde_json::Map::new())); }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) { return Ok(value); }
    if let Ok(unescaped) = serde_json::from_str::<String>(trimmed) {
        if let Ok(value) = serde_json::from_str::<Value>(&unescaped) { return Ok(value); }
        if let Ok(value) = json5::from_str::<Value>(&unescaped) { return Ok(value); }
    }
    if let Ok(value) = json5::from_str::<Value>(trimmed) { return Ok(value); }
    Err("工具参数解析失败".to_string())
}
