use super::event_handler::{emit_event, emit_status, handle_incoming_message};
use super::connection::Framing;
use super::session::CodexSession;
use super::types::{CodexIncomingMessage, CodexStatus, McpTool, PendingAction, JsonRpcResponse};
use lazy_static::lazy_static;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tokio::time::timeout;

lazy_static! {
    static ref SESSIONS: Arc<Mutex<HashMap<String, CodexSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
pub async fn codex_start_session(
    app: AppHandle,
    session_id: String,
    workspace: String,
    cli_path: Option<String>,
    cli_args: Option<Vec<String>>,
) -> Result<String, String> {
    let app_for_error = app.clone();
    let session_for_error = session_id.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        codex_start_session_blocking(app, session_id, workspace, cli_path, cli_args)
    });

    match timeout(Duration::from_secs(120), handle).await {
        Ok(join_result) => match join_result {
            Ok(result) => result,
            Err(error) => {
                let message = format!("启动 Codex 线程失败: {}", error);
                emit_status(
                    &app_for_error,
                    &session_for_error,
                    CodexStatus::Error,
                    Some(serde_json::json!({ "error": message })),
                );
                Err(message)
            }
        },
        Err(_) => {
            let message = "启动 Codex 超时（120s）".to_string();
            emit_status(
                &app_for_error,
                &session_for_error,
                CodexStatus::Error,
                Some(serde_json::json!({ "error": message })),
            );
            Err(message)
        }
    }
}

fn codex_start_session_blocking(
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
        handle_mcp_message(&app_clone, &session_id_clone, &message);
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
    let cli_args = match cli_args {
        Some(args) if !args.is_empty() => args,
        _ => detect_mcp_args(&cli_path),
    };

    let framing = if cli_args.iter().any(|arg| arg == "mcp-server")
        || (cli_args.len() >= 2 && cli_args[0] == "mcp" && cli_args[1] == "serve")
    {
        Framing::Line
    } else {
        Framing::ContentLength
    };

    let session = CodexSession::new(
        session_id.clone(),
        workspace_path,
        &cli_path,
        &cli_args,
        framing,
        is_mcp_server(&cli_args),
        pending_actions,
        on_message,
        on_stderr,
    )
    .map_err(|error| {
        emit_status(
            &app,
            &session_id,
            CodexStatus::Error,
            Some(serde_json::json!({ "error": error })),
        );
        error
    })?;

    emit_status(&app, &session_id, CodexStatus::Connected, None);
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    sessions.insert(session_id.clone(), session);

    if is_mcp_server(&cli_args) {
        if let Err(error) = start_mcp_handshake(&app, &session_id) {
            if let Ok(mut sessions) = SESSIONS.lock() {
                sessions.remove(&session_id);
            }
            emit_status(
                &app,
                &session_id,
                CodexStatus::Error,
                Some(serde_json::json!({ "error": error })),
            );
            return Err(error);
        }
    }

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

    if session.is_mcp {
        if !session.mcp_initialized || session.tools.is_empty() {
            return Err("MCP 工具尚未就绪，请稍候重试".to_string());
        }

        let tool_name = session
            .selected_tool
            .clone()
            .or_else(|| select_tool_name(&session.tools))
            .ok_or_else(|| "未找到可用的 MCP 工具".to_string())?;

        let arguments = build_tool_arguments(
            session
                .tools
                .iter()
                .find(|tool| tool.name == tool_name),
            &content,
            files.clone(),
            &session.workspace,
        );

        let params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });

        return session.connection.send_request("tools/call", Some(params));
    }

    let params = serde_json::json!({
        "content": content,
        "files": files,
    });

    session
        .connection
        .send_request("codex.send_message", Some(params))
}

fn is_mcp_server(cli_args: &[String]) -> bool {
    cli_args.iter().any(|arg| arg == "mcp-server")
}

fn start_mcp_handshake(app: &AppHandle, session_id: &str) -> Result<(), String> {
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

    let init_result = connection.send_request_and_wait(
        "initialize",
        Some(init_params),
        Duration::from_secs(15),
    );

    if let Err(init_error) = init_result {
        let tools_result =
            connection.send_request_and_wait("tools/list", None, Duration::from_secs(10));
        if let Err(tools_error) = tools_result {
            return Err(format!("初始化失败: {}，工具列表失败: {}", init_error, tools_error));
        }
    }

    Ok(())
}

fn handle_mcp_message(app: &AppHandle, session_id: &str, message: &CodexIncomingMessage) {
    let response = match message {
        CodexIncomingMessage::Response(response) => response,
        _ => return,
    };

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

fn detect_mcp_args(cli_path: &str) -> Vec<String> {
    if let Some(version) = detect_codex_version(cli_path) {
        if version >= (0, 40, 0) {
            return vec!["mcp-server".to_string()];
        }
        return vec!["mcp".to_string(), "serve".to_string()];
    }
    vec!["mcp-server".to_string()]
}

fn detect_codex_version(cli_path: &str) -> Option<(u32, u32, u32)> {
    let output = Command::new(cli_path).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    for token in text.split_whitespace() {
        let cleaned = token
            .trim_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .to_string();
        if let Some(version) = parse_version(&cleaned) {
            return Some(version);
        }
    }
    None
}

fn parse_version(input: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = input.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].parse::<u32>().ok()?;
    Some((major, minor, patch))
}

fn is_initialize_result(result: &Value) -> bool {
    result.get("capabilities").is_some()
        || result.get("serverInfo").is_some()
        || result.get("protocolVersion").is_some()
}

fn is_tools_list_result(result: &Value) -> bool {
    result.get("tools").and_then(|value| value.as_array()).is_some()
}

fn extract_tools(result: &Value) -> Vec<McpTool> {
    let tools_value = result
        .get("tools")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    tools_value
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let input_schema = tool
                .get("inputSchema")
                .or_else(|| tool.get("input_schema"))
                .cloned();
            Some(McpTool {
                name,
                description,
                input_schema,
            })
        })
        .collect()
}

fn select_tool_name(tools: &[McpTool]) -> Option<String> {
    let priorities = ["codex", "chat", "assistant"];
    for keyword in priorities {
        if let Some(tool) = tools.iter().find(|tool| tool.name.to_lowercase().contains(keyword)) {
            return Some(tool.name.clone());
        }
    }
    tools.first().map(|tool| tool.name.clone())
}

fn build_tool_arguments(
    tool: Option<&McpTool>,
    content: &str,
    files: Option<Vec<String>>,
    workspace: &Path,
) -> Value {
    let mut args = serde_json::Map::new();
    let schema = tool
        .and_then(|tool| tool.input_schema.as_ref())
        .and_then(|schema| schema.get("properties"))
        .and_then(|props| props.as_object());

    let content_key = pick_property(schema, &["content", "prompt", "input", "message", "query", "text"])
        .unwrap_or_else(|| "content".to_string());
    args.insert(content_key, Value::String(content.to_string()));

    if let Some(files) = files {
        if let Some(files_key) = pick_property(schema, &["files", "paths", "file_paths", "filePaths"]) {
            args.insert(files_key, Value::Array(files.into_iter().map(Value::String).collect()));
        }
    }

    if let Some(workspace_key) = pick_property(schema, &["workspace", "cwd", "working_dir", "root"]) {
        args.insert(
            workspace_key,
            Value::String(workspace.to_string_lossy().to_string()),
        );
    }

    Value::Object(args)
}

fn pick_property(schema: Option<&serde_json::Map<String, Value>>, candidates: &[&str]) -> Option<String> {
    let schema = schema?;
    candidates
        .iter()
        .find(|key| schema.contains_key(**key))
        .map(|key| key.to_string())
}

#[tauri::command]
pub fn codex_approve_action(
    app: AppHandle,
    session_id: String,
    call_id: u64,
    decision: String,
) -> Result<(), String> {
    let approved = decision.to_lowercase() == "approve" || decision.to_lowercase() == "yes";

    let (connection, workspace, pending_actions) = {
        let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        (
            session.connection.clone(),
            session.workspace.clone(),
            session.pending_actions.clone(),
        )
    };

    let action = pending_actions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&call_id);

    if let Some(action) = action {
        if approved {
            match action {
                PendingAction::Patch { patch } => {
                    apply_patch(&workspace, &patch)?;
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
                    let working_dir = resolve_working_dir(&workspace, &working_dir)?;
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
    connection.send_response(call_id, result)?;
    Ok(())
}

#[tauri::command]
pub fn codex_stop_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let session = {
        let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
        sessions.remove(&session_id)
    };
    if let Some(session) = session {
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
