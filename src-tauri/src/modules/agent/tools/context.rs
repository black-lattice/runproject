use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use serde_json::Value;
use tokio::sync::oneshot;
use super::super::types::{ApprovalState, PendingAction};
use super::super::utils::emit_event;

#[derive(Clone)]
pub struct ToolContext {
    pub app: AppHandle,
    pub session_id: String,
    pub workspace: PathBuf,
    pub approvals: Arc<ApprovalState>,
}

impl ToolContext {
    pub async fn request_approval(&self, action_type: &str, params: Value) -> Result<bool, String> {
        if self.is_auto_approved(action_type) {
            return Ok(true);
        }

        let call_id = self
            .approvals
            .next_id
            .fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self
                .approvals
                .pending
                .lock()
                .map_err(|_| "权限队列锁失败".to_string())?;
            pending.insert(
                call_id,
                PendingAction {
                    action_type: action_type.to_string(),
                    params: params.clone(),
                    responder: tx,
                },
            );
        }

        emit_event(
            &self.app,
            &self.session_id,
            "permission-request",
            Some(serde_json::json!({
                "callId": call_id,
                "actionType": action_type,
                "params": params,
            })),
        );

        rx.await.map_err(|_| "权限审批通道已关闭".to_string())
    }

    fn is_auto_approved(&self, action_type: &str) -> bool {
        self.approvals
            .auto_approve
            .lock()
            .ok()
            .and_then(|map| map.get(action_type).copied())
            .unwrap_or(false)
    }
}
