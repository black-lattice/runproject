use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use crate::modules::codex::connection::CodexConnection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    pub provider: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_key: String::new(),
            base_url: None,
            model: "gpt-4.1-mini".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    pub timestamp_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSessionRecord {
    pub id: String,
    pub created_at_ms: u128,
    pub workspace: String,
    pub provider: String,
    pub model: String,
    pub messages: Vec<AgentMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    pub timestamp_ms: u128,
}

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

pub struct AgentSession {
    pub workspace: PathBuf,
    pub session_file: PathBuf,
    pub history: Vec<AgentMessage>,
    pub approvals: Arc<ApprovalState>,
    pub mcp_clients: Arc<Mutex<HashMap<String, Arc<CodexConnection>>>>,
}
