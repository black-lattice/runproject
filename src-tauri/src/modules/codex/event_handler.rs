use super::types::{CodexEvent, CodexIncomingMessage, CodexStatus, PendingAction};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub fn emit_status(app: &AppHandle, session_id: &str, status: CodexStatus, detail: Option<Value>) {
    let payload = serde_json::json!({
        "status": status,
        "detail": detail,
        "timestamp_ms": now_ms(),
    });
    let _ = app.emit(&format!("codex-status-{}", session_id), payload);
}

pub fn emit_event(app: &AppHandle, session_id: &str, kind: &str, payload: Option<Value>) {
    let event = CodexEvent {
        kind: kind.to_string(),
        payload,
        timestamp_ms: now_ms(),
    };
    let _ = app.emit(&format!("codex-event-{}", session_id), event);
}

pub fn emit_file_change(app: &AppHandle, session_id: &str, payload: Value) {
    let _ = app.emit(&format!("codex-file-change-{}", session_id), payload);
}

pub fn handle_incoming_message(
    app: &AppHandle,
    session_id: &str,
    workspace: &Path,
    pending_actions: &Arc<Mutex<HashMap<u64, PendingAction>>>,
    message: CodexIncomingMessage,
) {
    match message {
        CodexIncomingMessage::Request { id, method, params } => {
            if let Some(action) = classify_pending_action(&method, &params) {
                if let Ok(mut actions) = pending_actions.lock() {
                    actions.insert(id, action.clone());
                }
                emit_event(
                    app,
                    session_id,
                    "permission-request",
                    Some(serde_json::json!({
                        "callId": id,
                        "method": method,
                        "params": params,
                        "workspace": workspace.to_string_lossy(),
                        "action": format!("{:?}", action),
                    })),
                );
                if matches!(action, PendingAction::Patch { .. }) {
                    if let Some(params) = params {
                        emit_file_change(app, session_id, params);
                    }
                }
            } else {
                emit_event(
                    app,
                    session_id,
                    "request",
                    Some(serde_json::json!({ "id": id, "method": method, "params": params })),
                );
            }
        }
        CodexIncomingMessage::Notification { method, params } => {
            emit_event(
                app,
                session_id,
                "notification",
                Some(serde_json::json!({ "method": method, "params": params })),
            );
        }
        CodexIncomingMessage::Response(response) => {
            emit_event(
                app,
                session_id,
                "response",
                Some(serde_json::to_value(response).unwrap_or_default()),
            );
        }
        CodexIncomingMessage::RawText(text) => {
            if !text.is_empty() {
                emit_event(app, session_id, "stdout", Some(serde_json::json!({ "text": text })));
            }
        }
        CodexIncomingMessage::ParseError(error) => {
            emit_event(app, session_id, "parse-error", Some(serde_json::json!({ "error": error })));
        }
    }
}

fn classify_pending_action(method: &str, params: &Option<Value>) -> Option<PendingAction> {
    if method_contains(method, "apply") && method_contains(method, "patch") {
        return Some(PendingAction::Patch {
            patch: extract_patch(params).unwrap_or_default(),
        });
    }

    if method_contains(method, "execute") && method_contains(method, "command") {
        if let Some((command, working_dir)) = extract_command(params) {
            return Some(PendingAction::Command { command, working_dir });
        }
        return Some(PendingAction::Other {
            payload: params.clone().unwrap_or(Value::Null),
        });
    }

    if method == "elicitation/create" {
        if let Some((command, working_dir)) = extract_codex_command(params) {
            return Some(PendingAction::Command { command, working_dir });
        }
        return Some(PendingAction::Other {
            payload: params.clone().unwrap_or(Value::Null),
        });
    }

    if let Some(action) = params
        .as_ref()
        .and_then(|value| value.get("action"))
        .and_then(|value| value.as_str())
    {
        if action == "apply_patch" {
            return Some(PendingAction::Patch {
                patch: extract_patch(params).unwrap_or_default(),
            });
        }
        if action == "execute_command" {
            if let Some((command, working_dir)) = extract_command(params) {
                return Some(PendingAction::Command { command, working_dir });
            }
            return Some(PendingAction::Other {
                payload: params.clone().unwrap_or(Value::Null),
            });
        }
    }

    None
}

fn method_contains(method: &str, needle: &str) -> bool {
    method.to_lowercase().contains(needle)
}

fn extract_patch(params: &Option<Value>) -> Option<String> {
    params.as_ref().and_then(|value| {
        value
            .get("patch")
            .and_then(|patch| patch.as_str())
            .map(|s| s.to_string())
    })
}

fn extract_command(params: &Option<Value>) -> Option<(String, std::path::PathBuf)> {
    let params = params.as_ref()?;
    let command = params.get("command")?.as_str()?.to_string();
    let cwd = params
        .get("working_dir")
        .or_else(|| params.get("cwd"))
        .and_then(|value| value.as_str())
        .unwrap_or(".");
    Some((command, std::path::PathBuf::from(cwd)))
}

fn extract_codex_command(params: &Option<Value>) -> Option<(String, std::path::PathBuf)> {
    let params = params.as_ref()?;
    let command_array = params.get("codex_command")?.as_array()?;
    let command = command_array
        .iter()
        .map(|v| v.as_str().unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" ");

    let cwd = params
        .get("codex_cwd")
        .and_then(|value| value.as_str())
        .unwrap_or(".");

    Some((command, std::path::PathBuf::from(cwd)))
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}
