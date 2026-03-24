pub mod classification;
pub mod emitters;
pub mod utils;

pub use emitters::{emit_event, emit_file_change, emit_status};

use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

use super::types::{CodexIncomingMessage, PendingAction};
use classification::classify_pending_action;

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
                emit_event(
                    app,
                    session_id,
                    "stdout",
                    Some(serde_json::json!({ "text": text })),
                );
            }
        }
        CodexIncomingMessage::ParseError(error) => {
            emit_event(
                app,
                session_id,
                "parse-error",
                Some(serde_json::json!({ "error": error })),
            );
        }
    }
}
