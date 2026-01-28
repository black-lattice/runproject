use serde_json::Value;
use tauri::{AppHandle, Emitter};
use super::super::types::{CodexEvent, CodexStatus};
use super::utils::now_ms;

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
