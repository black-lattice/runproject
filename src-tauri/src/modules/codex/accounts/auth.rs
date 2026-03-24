use crate::modules::codex::accounts::types::CodexAccountMeta;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde_json::Value;

pub(crate) fn read_meta_from_auth_text(auth_text: &str) -> Result<CodexAccountMeta, String> {
    let auth_json: Value = serde_json::from_str(auth_text)
        .map_err(|error| format!("解析 auth.json 失败: {}", error))?;

    let auth_mode = auth_json
        .get("auth_mode")
        .and_then(Value::as_str)
        .map(str::to_string);
    let id_token = auth_json
        .pointer("/tokens/id_token")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let access_token = auth_json
        .pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let id_payload = decode_jwt_payload(id_token).unwrap_or_default();
    let access_payload = decode_jwt_payload(access_token).unwrap_or_default();

    let id_auth = id_payload
        .get("https://api.openai.com/auth")
        .cloned()
        .unwrap_or(Value::Null);
    let access_auth = access_payload
        .get("https://api.openai.com/auth")
        .cloned()
        .unwrap_or(Value::Null);
    let access_profile = access_payload
        .get("https://api.openai.com/profile")
        .cloned()
        .unwrap_or(Value::Null);

    Ok(CodexAccountMeta {
        auth_mode,
        email: first_string(&[
            id_payload.get("email"),
            access_profile.get("email"),
            access_payload.get("email"),
        ]),
        display_name: first_string(&[id_payload.get("name"), access_payload.get("name")]),
        plan_type: first_string(&[
            id_auth.get("chatgpt_plan_type"),
            access_auth.get("chatgpt_plan_type"),
        ]),
        subscription_active_until: first_string(&[
            id_auth.get("chatgpt_subscription_active_until"),
            access_auth.get("chatgpt_subscription_active_until"),
        ]),
        account_id: first_string(&[
            id_auth.get("chatgpt_account_id"),
            access_auth.get("chatgpt_account_id"),
            auth_json.pointer("/tokens/account_id"),
        ]),
        user_id: first_string(&[
            id_auth.get("chatgpt_user_id"),
            access_auth.get("chatgpt_user_id"),
        ]),
    })
}

fn decode_jwt_payload(token: &str) -> Result<Value, String> {
    if token.trim().is_empty() {
        return Ok(Value::Null);
    }

    let payload = token
        .split('.')
        .nth(1)
        .ok_or_else(|| "JWT 缺少 payload".to_string())?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|error| format!("解码 JWT 失败: {}", error))?;
    serde_json::from_slice::<Value>(&decoded)
        .map_err(|error| format!("解析 JWT payload 失败: {}", error))
}

fn first_string(values: &[Option<&Value>]) -> Option<String> {
    values.iter().find_map(|value| {
        value
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
    })
}
