use super::connection::CodexConnection;
use super::types::{CodexIncomingMessage, PendingAction};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct CodexSession {
    pub session_id: String,
    pub workspace: PathBuf,
    pub connection: Arc<CodexConnection>,
    pub pending_actions: Arc<Mutex<std::collections::HashMap<u64, PendingAction>>>,
}

impl CodexSession {
    pub fn new(
        session_id: String,
        workspace: PathBuf,
        cli_path: &str,
        cli_args: &[String],
        pending_actions: Arc<Mutex<std::collections::HashMap<u64, PendingAction>>>,
        on_message: Arc<dyn Fn(CodexIncomingMessage) + Send + Sync>,
        on_stderr: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<Self, String> {
        let connection = CodexConnection::spawn(cli_path, cli_args, on_message, on_stderr)?;
        Ok(Self {
            session_id,
            workspace,
            connection,
            pending_actions,
        })
    }
}
