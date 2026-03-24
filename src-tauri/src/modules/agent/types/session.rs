use super::super::super::codex::connection::CodexConnection;
use super::approval::ApprovalState;
use super::chat::AgentMessage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AgentSession {
    pub workspace: PathBuf,
    pub session_file: PathBuf,
    pub history: Vec<AgentMessage>,
    pub approvals: Arc<ApprovalState>,
    pub mcp_clients: Arc<Mutex<HashMap<String, Arc<CodexConnection>>>>,
}
