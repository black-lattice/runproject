use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::rpc::JsonRpcResponse;

#[derive(Debug, Clone)]
pub enum CodexIncomingMessage {
    Request {
        id: u64,
        method: String,
        params: Option<Value>,
    },
    Notification {
        method: String,
        params: Option<Value>,
    },
    Response(JsonRpcResponse),
    RawText(String),
    ParseError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexEvent {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
    pub timestamp_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodexStatus {
    Connecting,
    Connected,
    Authenticated,
    SessionActive,
    Closed,
    Error,
}
