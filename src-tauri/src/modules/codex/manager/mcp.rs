use std::time::Duration;
use tauri::AppHandle;
use serde_json::Value;
use super::super::types::{CodexIncomingMessage, JsonRpcResponse};
use super::super::event_handler::emit_event;
use super::tools::{is_initialize_result, is_tools_list_result, extract_tools, select_tool_name};
use super::SESSIONS;

pub fn start_mcp_handshake(_app: &AppHandle, session_id: &str) -> Result<(), String> {
    println!("[CODEX] Starting MCP handshake for session: {}", session_id);
    let init_params = serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
            "name": "runproject",
            "version": env!("CARGO_PKG_VERSION"),
        }
    });

    let connection = {
        let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        session.connection.clone()
    };

    connection
        .wait_for_server_ready(Duration::from_secs(120))
        .map_err(|e| format!("MCP 未就绪: {}", e))?;

    println!("[CODEX] MCP server ready, sending initialize...");
    let init_result = connection.send_request_and_wait(
        "initialize",
        Some(init_params),
        Duration::from_secs(15),
    );

    if let Err(init_error) = init_result {
        println!("[CODEX] MCP initialize failed, trying tools/list fallback: {}", init_error);
        let tools_result =
            connection.send_request_and_wait("tools/list", None, Duration::from_secs(10));
        if let Err(tools_error) = tools_result {
            return Err(format!("初始化失败: {}，工具列表失败: {}", init_error, tools_error));
        }
    }

    println!("[CODEX] MCP handshake initiated successfully.");
    Ok(())
}

pub fn handle_mcp_message(app: &AppHandle, session_id: &str, message: &CodexIncomingMessage) {
    match message {
        CodexIncomingMessage::Response(response) => {
            match response {
                JsonRpcResponse::Ok { result, .. } => {
                    if is_tools_list_result(result) {
                        let tools = extract_tools(result);
                        let selected_tool = select_tool_name(&tools);
                        if let Ok(mut sessions) = SESSIONS.lock() {
                            if let Some(session) = sessions.get_mut(session_id) {
                                session.mcp_initialized = true;
                                session.tools = tools.clone();
                                session.selected_tool = selected_tool.clone();
                                session.tools_request_id = None;
                            }
                        }
                        emit_event(
                            app,
                            session_id,
                            "mcp-tools",
                            Some(serde_json::json!({
                                "selectedTool": selected_tool,
                                "tools": tools
                            })),
                        );
                        return;
                    }

                    if is_initialize_result(result) {
                        if let Ok(mut sessions) = SESSIONS.lock() {
                            if let Some(session) = sessions.get_mut(session_id) {
                                if session.mcp_initialized {
                                    return;
                                }
                                session.mcp_initialized = true;
                            }
                        }
                        let connection = {
                            let sessions = match SESSIONS.lock() {
                                Ok(sessions) => sessions,
                                Err(_) => return,
                            };
                            let session = match sessions.get(session_id) {
                                Some(session) => session,
                                None => return,
                            };
                            session.connection.clone()
                        };

                        let _ = connection.send_notification("initialized", None);
                        if let Ok(tools_id) = connection.send_request("tools/list", None) {
                            if let Ok(mut sessions) = SESSIONS.lock() {
                                if let Some(session) = sessions.get_mut(session_id) {
                                    session.tools_request_id = Some(tools_id);
                                }
                            }
                        }
                    }
                }
                JsonRpcResponse::Err { error, .. } => {
                    emit_event(
                        app,
                        session_id,
                        "mcp-error",
                        Some(serde_json::json!({ "error": error })),
                    );
                }
            }
        }
        CodexIncomingMessage::Notification { method, params } => {
            if method == "codex/event" {
                if let Some(params) = params {
                    if let Some(msg) = params.get("msg") {
                        if let Some(msg_type) = msg.get("type").and_then(|v| v.as_str()) {
                            if msg_type == "session_configured" {
                                if let Some(new_session_id) = msg.get("session_id").and_then(|v| v.as_str()) {
                                    println!("DEBUG: Session configured with ID: {}", new_session_id);
                                    if let Ok(mut sessions) = SESSIONS.lock() {
                                        if let Some(session) = sessions.get_mut(session_id) {
                                            session.conversation_id = new_session_id.to_string();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        _ => {}
    }
}
