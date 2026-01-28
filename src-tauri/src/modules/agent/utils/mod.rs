use tauri::{AppHandle, Emitter};
use serde_json::Value;

pub fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}

pub fn emit_event(app: &AppHandle, session_id: &str, kind: &str, payload: Option<Value>) {
    let _ = app.emit(
        &format!("agent-event-{}", session_id),
        serde_json::json!({
            "kind": kind,
            "payload": payload,
            "timestamp_ms": now_ms(),
        }),
    );
}
