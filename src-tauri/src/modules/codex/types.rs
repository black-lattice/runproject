use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcResponse {
    Ok {
        jsonrpc: String,
        id: u64,
        result: Value,
    },
    Err {
        jsonrpc: String,
        id: u64,
        error: JsonRpcError,
    },
}

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

#[derive(Debug, Clone)]
pub enum PendingAction {
    Command {
        command: String,
        working_dir: PathBuf,
    },
    Patch {
        patch: String,
    },
    Other {
        payload: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<Value>,
}
