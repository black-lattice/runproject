use serde_json::Value;
use crate::modules::codex::types::PendingAction;

pub fn classify_pending_action(method: &str, params: &Option<Value>) -> Option<PendingAction> {
    if method_contains(method, "apply") && method_contains(method, "patch") {
        return Some(PendingAction::Patch {
            patch: extract_patch(params).unwrap_or_default(),
        });
    }

    if method_contains(method, "execute") && method_contains(method, "command") {
        if let Some((command, working_dir)) = extract_command(params) {
            return Some(PendingAction::Command { command, working_dir });
        }
        return Some(PendingAction::Other {
            payload: params.clone().unwrap_or(Value::Null),
        });
    }

    if method == "elicitation/create" {
        if let Some((command, working_dir)) = extract_codex_command(params) {
            return Some(PendingAction::Command { command, working_dir });
        }
        return Some(PendingAction::Other {
            payload: params.clone().unwrap_or(Value::Null),
        });
    }

    if let Some(action) = params
        .as_ref()
        .and_then(|value| value.get("action"))
        .and_then(|value| value.as_str())
    {
        if action == "apply_patch" {
            return Some(PendingAction::Patch {
                patch: extract_patch(params).unwrap_or_default(),
            });
        }
        if action == "execute_command" {
            if let Some((command, working_dir)) = extract_command(params) {
                return Some(PendingAction::Command { command, working_dir });
            }
            return Some(PendingAction::Other {
                payload: params.clone().unwrap_or(Value::Null),
            });
        }
    }

    None
}

fn method_contains(method: &str, needle: &str) -> bool {
    method.to_lowercase().contains(needle)
}

fn extract_patch(params: &Option<Value>) -> Option<String> {
    params.as_ref().and_then(|value| {
        value
            .get("patch")
            .and_then(|patch| patch.as_str())
            .map(|s| s.to_string())
    })
}

fn extract_command(params: &Option<Value>) -> Option<(String, std::path::PathBuf)> {
    let params = params.as_ref()?;
    let command = params.get("command")?.as_str()?.to_string();
    let cwd = params
        .get("working_dir")
        .or_else(|| params.get("cwd"))
        .and_then(|value| value.as_str())
        .unwrap_or(".");
    Some((command, std::path::PathBuf::from(cwd)))
}

fn extract_codex_command(params: &Option<Value>) -> Option<(String, std::path::PathBuf)> {
    let params = params.as_ref()?;
    let command_array = params.get("codex_command")?.as_array()?;
    let command = command_array
        .iter()
        .map(|v| v.as_str().unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" ");

    let cwd = params
        .get("codex_cwd")
        .and_then(|value| value.as_str())
        .unwrap_or(".");

    Some((command, std::path::PathBuf::from(cwd)))
}
