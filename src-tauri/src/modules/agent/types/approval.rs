use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::AtomicU64;
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct PendingAction {
    pub action_type: String,
    pub params: Value,
    pub responder: oneshot::Sender<bool>,
}

#[derive(Debug)]
pub struct ApprovalState {
    pub next_id: AtomicU64,
    pub pending: Mutex<HashMap<u64, PendingAction>>,
    pub auto_approve: Mutex<HashMap<String, bool>>,
}
