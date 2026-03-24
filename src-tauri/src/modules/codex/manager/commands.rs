use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tokio::time::timeout;

use super::super::connection::Framing;
use super::super::event_handler::{emit_event, emit_status, handle_incoming_message};
use super::super::session::CodexSession;
use super::super::types::{CodexStatus, PendingAction};
use super::actions::apply_patch;
use super::discovery::{detect_mcp_args, is_mcp_server};
use super::mcp::{handle_mcp_message, start_mcp_handshake};
use super::tools::{build_tool_arguments, select_tool_name};
use super::utils::{resolve_working_dir, validate_workspace};
use super::SESSIONS;

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
    println!(
        "DEBUG: Starting Codex session: {}, workspace: {}",
        session_id, workspace
    );
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

    println!("DEBUG: Session created successfully");

    emit_status(&app, &session_id, CodexStatus::Connected, None);
    {
        let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
        sessions.insert(session_id.clone(), session);
    }

    if is_mcp_server(&cli_args) {
        println!("DEBUG: Starting MCP handshake...");
        if let Err(error) = start_mcp_handshake(&app, &session_id) {
            println!("DEBUG: MCP handshake failed: {}", error);
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
        println!("DEBUG: MCP handshake completed.");
    }

    Ok(session_id)
}

#[tauri::command]
pub fn codex_send_message(
    session_id: String,
    content: String,
    files: Option<Vec<String>>,
    model: Option<String>,
) -> Result<u64, String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;

    if session.is_mcp {
        if !session.mcp_initialized || session.tools.is_empty() {
            return Err("MCP 工具尚未就绪，请稍候重试".to_string());
        }

        let has_codex_reply = session.tools.iter().any(|t| t.name == "codex-reply");

        let tool_name = if session.conversation_started && has_codex_reply {
            "codex-reply".to_string()
        } else {
            session
                .selected_tool
                .clone()
                .or_else(|| select_tool_name(&session.tools))
                .ok_or_else(|| "未找到可用的 MCP 工具".to_string())?
        };

        let arguments = build_tool_arguments(
            session.tools.iter().find(|tool| tool.name == tool_name),
            &content,
            files.clone(),
            &session.workspace,
            model.clone(),
        );

        let mut params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });

        if !session.conversation_started {
            params.as_object_mut().unwrap().insert(
                "config".to_string(),
                serde_json::json!({ "conversationId": session.conversation_id }),
            );
            session.conversation_started = true;
        } else if tool_name == "codex-reply" {
            if let Some(args) = params.get_mut("arguments").and_then(|a| a.as_object_mut()) {
                args.insert(
                    "conversationId".to_string(),
                    serde_json::Value::String(session.conversation_id.clone()),
                );
            }
        }

        return session.connection.send_request("tools/call", Some(params));
    }

    let params = serde_json::json!({
        "content": content,
        "files": files,
        "model": model,
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

                    println!(
                        "DEBUG: Executing command: '{}' in '{}'",
                        command,
                        working_dir.display()
                    );

                    #[cfg(target_os = "windows")]
                    let shell = "cmd";
                    #[cfg(target_os = "windows")]
                    let arg = "/C";

                    #[cfg(not(target_os = "windows"))]
                    let shell = "sh";
                    #[cfg(not(target_os = "windows"))]
                    let arg = "-c";

                    let output_result = std::process::Command::new(shell)
                        .arg(arg)
                        .arg(&command)
                        .current_dir(&working_dir)
                        .output();

                    match output_result {
                        Ok(output) => {
                            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                            let exit_code = output.status.code().unwrap_or(-1);

                            emit_event(
                                &app,
                                &session_id,
                                "command-executed",
                                Some(serde_json::json!({
                                    "callId": call_id,
                                    "command": command,
                                    "workingDir": working_dir.to_string_lossy(),
                                    "stdout": stdout,
                                    "stderr": stderr,
                                    "exitCode": exit_code
                                })),
                            );
                        }
                        Err(e) => {
                            return Err(format!("命令执行失败: {}", e));
                        }
                    }
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

    let decision_str = if approved { "approved" } else { "rejected" };
    let result = serde_json::json!({ "decision": decision_str });
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
