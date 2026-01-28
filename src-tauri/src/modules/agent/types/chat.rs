use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    pub payload: Option<Value>,
    pub timestamp_ms: u128,
}
