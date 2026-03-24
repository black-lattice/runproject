use super::connection::{CodexConnection, Framing};
use super::types::{CodexIncomingMessage, McpTool, PendingAction};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct CodexSession {
    pub session_id: String,
    pub conversation_id: String,
    pub workspace: PathBuf,
    pub connection: Arc<CodexConnection>,
    pub pending_actions: Arc<Mutex<std::collections::HashMap<u64, PendingAction>>>,
    pub is_mcp: bool,
    pub mcp_initialized: bool,
    pub init_request_id: Option<u64>,
    pub tools_request_id: Option<u64>,
    pub tools: Vec<McpTool>,
    pub selected_tool: Option<String>,
    pub conversation_started: bool,
}

impl CodexSession {
    pub fn new(
        session_id: String,
        workspace: PathBuf,
        cli_path: &str,
        cli_args: &[String],
        framing: Framing,
        is_mcp: bool,
        pending_actions: Arc<Mutex<std::collections::HashMap<u64, PendingAction>>>,
        on_message: Arc<dyn Fn(CodexIncomingMessage) + Send + Sync>,
        on_stderr: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<Self, String> {
        let connection =
            CodexConnection::spawn(cli_path, cli_args, framing, on_message, on_stderr)?;
        Ok(Self {
            session_id,
            conversation_id: Uuid::new_v4().to_string(),
            workspace,
            connection,
            pending_actions,
            is_mcp,
            mcp_initialized: false,
            init_request_id: None,
            tools_request_id: None,
            tools: Vec::new(),
            selected_tool: None,
            conversation_started: false,
        })
    }
}
