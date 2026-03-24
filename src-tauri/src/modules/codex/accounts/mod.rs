use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const PROFILE_FILE: &str = "profile.json";
const AUTH_FILE: &str = "auth.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountMeta {
    pub auth_mode: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub plan_type: Option<String>,
    pub account_id: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexRateWindow {
    pub used_percent: u64,
    pub remaining_percent: u64,
    pub window_minutes: Option<u64>,
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexStatusSnapshot {
    pub sampled_at: Option<String>,
    pub primary: Option<CodexRateWindow>,
    pub secondary: Option<CodexRateWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountProfileRecord {
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub meta: CodexAccountMeta,
    pub status: CodexStatusSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountProfile {
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub meta: CodexAccountMeta,
    pub status: CodexStatusSnapshot,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountListResponse {
    pub current_global: Option<CodexAccountMeta>,
    pub current_profile_name: Option<String>,
    pub profiles: Vec<CodexAccountProfile>,
}

#[tauri::command]
pub fn codex_account_list(app: AppHandle) -> Result<CodexAccountListResponse, String> {
    build_list_response(&app)
}

#[tauri::command]
pub fn codex_account_import_current(
    app: AppHandle,
    name: Option<String>,
) -> Result<CodexAccountProfile, String> {
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    let meta = read_meta_from_auth_text(&auth_text)?;
    let status = read_status_from_home(&global_home)?;

    let preferred_name = name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| {
            meta.email
                .clone()
                .or(meta.account_id.clone())
                .unwrap_or_else(|| format!("账号-{}", now_ts()))
        });

    let profile_name = sanitize_profile_name(&preferred_name);
    let existing = load_profile_record(&app, &profile_name).ok();
    let record = CodexAccountProfileRecord {
        name: profile_name.clone(),
        created_at: existing
            .as_ref()
            .map(|item| item.created_at)
            .unwrap_or_else(now_ts),
        updated_at: now_ts(),
        meta,
        status,
    };

    save_profile_snapshot(&app, &record, &auth_text)?;
    Ok(to_profile_dto(
        record,
        is_profile_active(&app, &profile_name)?,
    ))
}

#[tauri::command]
pub fn codex_account_sync_current(
    app: AppHandle,
    profile_name: String,
) -> Result<CodexAccountProfile, String> {
    let profile_name = sanitize_profile_name(&profile_name);
    let existing = load_profile_record(&app, &profile_name)?;
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    let meta = read_meta_from_auth_text(&auth_text)?;
    let status = read_status_from_home(&global_home)?;
    let record = CodexAccountProfileRecord {
        name: profile_name.clone(),
        created_at: existing.created_at,
        updated_at: now_ts(),
        meta,
        status,
    };

    save_profile_snapshot(&app, &record, &auth_text)?;
    Ok(to_profile_dto(
        record,
        is_profile_active(&app, &profile_name)?,
    ))
}

#[tauri::command]
pub fn codex_account_switch(
    app: AppHandle,
    profile_name: String,
) -> Result<CodexAccountProfile, String> {
    let target_name = sanitize_profile_name(&profile_name);
    let target_record = load_profile_record(&app, &target_name)?;
    let target_auth_path = profile_auth_path(&app, &target_name)?;
    let target_auth_text = fs::read_to_string(&target_auth_path)
        .map_err(|error| format!("读取账号快照失败: {}", error))?;

    // 切换前先把当前全局账号的最新状态回写到对应快照，避免额度信息丢失。
    if let Ok((current_name, current_auth_text, current_status, current_meta)) =
        read_current_managed_snapshot(&app)
    {
        if current_name != target_name {
            let current_record = load_profile_record(&app, &current_name)?;
            let synced_record = CodexAccountProfileRecord {
                name: current_name.clone(),
                created_at: current_record.created_at,
                updated_at: now_ts(),
                meta: current_meta,
                status: current_status,
            };
            save_profile_snapshot(&app, &synced_record, &current_auth_text)?;
        }
    }

    let global_home = global_codex_home()?;
    let global_auth_path = global_home.join(AUTH_FILE);
    if let Some(parent) = global_auth_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 Codex 目录失败: {}", error))?;
    }
    fs::write(&global_auth_path, target_auth_text)
        .map_err(|error| format!("写入全局 Codex 认证失败: {}", error))?;

    Ok(to_profile_dto(target_record, true))
}

fn build_list_response(app: &AppHandle) -> Result<CodexAccountListResponse, String> {
    let records = load_all_profile_records(app)?;
    let current_global = read_current_global_meta(app).ok();
    let current_profile_name = current_global
        .as_ref()
        .and_then(|meta| match_profile_name(&records, meta));

    let profiles = records
        .into_iter()
        .map(|record| {
            let is_active = current_profile_name
                .as_ref()
                .map(|name| name == &record.name)
                .unwrap_or(false);
            to_profile_dto(record, is_active)
        })
        .collect();

    Ok(CodexAccountListResponse {
        current_global,
        current_profile_name,
        profiles,
    })
}

fn is_profile_active(app: &AppHandle, profile_name: &str) -> Result<bool, String> {
    let current = read_current_global_meta(app)?;
    let records = load_all_profile_records(app)?;
    Ok(match_profile_name(&records, &current)
        .map(|name| name == profile_name)
        .unwrap_or(false))
}

fn read_current_managed_snapshot(
    app: &AppHandle,
) -> Result<(String, String, CodexStatusSnapshot, CodexAccountMeta), String> {
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    let current_meta = read_meta_from_auth_text(&auth_text)?;
    let records = load_all_profile_records(app)?;
    let current_name = match_profile_name(&records, &current_meta)
        .ok_or_else(|| "当前全局 Codex 账号未纳入管理".to_string())?;
    let current_status = read_status_from_home(&global_home)?;
    Ok((current_name, auth_text, current_status, current_meta))
}

fn read_current_global_meta(app: &AppHandle) -> Result<CodexAccountMeta, String> {
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    read_meta_from_auth_text(&auth_text).map_err(|error| {
        format!(
            "读取当前全局 Codex 账号失败（{}）: {}",
            app.package_info().name,
            error
        )
    })
}

fn match_profile_name(
    records: &[CodexAccountProfileRecord],
    current_meta: &CodexAccountMeta,
) -> Option<String> {
    records
        .iter()
        .find(|record| metas_match(&record.meta, current_meta))
        .map(|record| record.name.clone())
}

fn metas_match(left: &CodexAccountMeta, right: &CodexAccountMeta) -> bool {
    let left_account = left.account_id.as_deref().unwrap_or("").trim();
    let right_account = right.account_id.as_deref().unwrap_or("").trim();
    if !left_account.is_empty() && !right_account.is_empty() && left_account == right_account {
        return true;
    }

    let left_email = left.email.as_deref().unwrap_or("").trim().to_lowercase();
    let right_email = right.email.as_deref().unwrap_or("").trim().to_lowercase();

    !left_email.is_empty() && !right_email.is_empty() && left_email == right_email
}

fn save_profile_snapshot(
    app: &AppHandle,
    record: &CodexAccountProfileRecord,
    auth_text: &str,
) -> Result<(), String> {
    let dir = profile_dir(app, &record.name)?;
    fs::create_dir_all(&dir).map_err(|error| format!("创建账号目录失败: {}", error))?;

    let auth_path = dir.join(AUTH_FILE);
    fs::write(&auth_path, auth_text).map_err(|error| format!("写入账号认证失败: {}", error))?;

    let profile_path = dir.join(PROFILE_FILE);
    let content = serde_json::to_string_pretty(record)
        .map_err(|error| format!("序列化账号信息失败: {}", error))?;
    fs::write(&profile_path, content).map_err(|error| format!("写入账号信息失败: {}", error))?;
    Ok(())
}

fn load_all_profile_records(app: &AppHandle) -> Result<Vec<CodexAccountProfileRecord>, String> {
    let profiles_root = profiles_root(app)?;
    if !profiles_root.exists() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    let entries =
        fs::read_dir(&profiles_root).map_err(|error| format!("读取账号目录失败: {}", error))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取账号目录项失败: {}", error))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let profile_path = path.join(PROFILE_FILE);
        if !profile_path.exists() {
            continue;
        }
        let content = fs::read_to_string(&profile_path)
            .map_err(|error| format!("读取账号信息失败: {}", error))?;
        let record = serde_json::from_str::<CodexAccountProfileRecord>(&content)
            .map_err(|error| format!("解析账号信息失败: {}", error))?;
        records.push(record);
    }

    records.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(records)
}

fn load_profile_record(
    app: &AppHandle,
    profile_name: &str,
) -> Result<CodexAccountProfileRecord, String> {
    let profile_path = profile_dir(app, profile_name)?.join(PROFILE_FILE);
    let content = fs::read_to_string(&profile_path)
        .map_err(|error| format!("读取账号信息失败: {}", error))?;
    serde_json::from_str::<CodexAccountProfileRecord>(&content)
        .map_err(|error| format!("解析账号信息失败: {}", error))
}

fn profile_auth_path(app: &AppHandle, profile_name: &str) -> Result<PathBuf, String> {
    Ok(profile_dir(app, profile_name)?.join(AUTH_FILE))
}

fn profile_dir(app: &AppHandle, profile_name: &str) -> Result<PathBuf, String> {
    Ok(profiles_root(app)?.join(profile_name))
}

fn profiles_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {}", error))?;
    Ok(app_data.join("codex_accounts").join("profiles"))
}

fn global_codex_home() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "无法获取 HOME 环境变量".to_string())?;
    Ok(Path::new(&home).join(".codex"))
}

fn read_auth_text(home_dir: &Path) -> Result<String, String> {
    let auth_path = home_dir.join(AUTH_FILE);
    fs::read_to_string(&auth_path).map_err(|error| format!("读取 Codex 认证文件失败: {}", error))
}

fn read_meta_from_auth_text(auth_text: &str) -> Result<CodexAccountMeta, String> {
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

fn read_status_from_home(home_dir: &Path) -> Result<CodexStatusSnapshot, String> {
    let sessions_dir = home_dir.join("sessions");
    if !sessions_dir.exists() {
        return Ok(CodexStatusSnapshot::default());
    }

    let mut jsonl_files = Vec::new();
    collect_jsonl_files(&sessions_dir, &mut jsonl_files)?;

    let mut latest_timestamp: Option<String> = None;
    let mut latest_snapshot = CodexStatusSnapshot::default();

    for file in jsonl_files {
        let content =
            fs::read_to_string(&file).map_err(|error| format!("读取会话文件失败: {}", error))?;
        for line in content.lines() {
            if !line.contains("\"token_count\"") {
                continue;
            }

            let Ok(item) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            let Some(payload) = item.get("payload") else {
                continue;
            };
            if payload.get("type").and_then(Value::as_str) != Some("token_count") {
                continue;
            }

            let rate_limits = payload
                .get("rate_limits")
                .or_else(|| payload.get("info").and_then(|info| info.get("rate_limits")));
            let Some(rate_limits) = rate_limits else {
                continue;
            };

            let timestamp = item
                .get("timestamp")
                .and_then(Value::as_str)
                .map(str::to_string);
            if timestamp.is_none() {
                continue;
            }
            let timestamp = timestamp.unwrap();

            let should_replace = latest_timestamp
                .as_ref()
                .map(|current| timestamp > *current)
                .unwrap_or(true);

            if should_replace {
                latest_timestamp = Some(timestamp.clone());
                latest_snapshot = CodexStatusSnapshot {
                    sampled_at: Some(timestamp),
                    primary: parse_window(rate_limits.get("primary")),
                    secondary: parse_window(rate_limits.get("secondary")),
                };
            }
        }
    }

    Ok(latest_snapshot)
}

fn collect_jsonl_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|error| format!("读取会话目录失败: {}", error))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取会话目录项失败: {}", error))?;
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, files)?;
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
    Ok(())
}

fn parse_window(value: Option<&Value>) -> Option<CodexRateWindow> {
    let value = value?;
    let used_percent = extract_u64(value.get("used_percent"))?;
    Some(CodexRateWindow {
        used_percent,
        remaining_percent: 100_u64.saturating_sub(used_percent.min(100)),
        window_minutes: extract_u64(value.get("window_minutes")),
        resets_at: extract_u64(value.get("resets_at")),
    })
}

fn extract_u64(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(number)) => number
            .as_u64()
            .or_else(|| number.as_i64().map(|item| item.max(0) as u64))
            .or_else(|| number.as_f64().map(|item| item.max(0.0) as u64)),
        _ => None,
    }
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

fn sanitize_profile_name(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return format!("账号-{}", now_ts());
    }

    let mut name = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_control() || ch == '/' || ch == '\\' {
            name.push('-');
        } else {
            name.push(ch);
        }
    }

    let name = name.trim_matches('-').trim();
    if name.is_empty() {
        format!("账号-{}", now_ts())
    } else {
        name.to_string()
    }
}

fn to_profile_dto(record: CodexAccountProfileRecord, is_active: bool) -> CodexAccountProfile {
    CodexAccountProfile {
        name: record.name,
        created_at: record.created_at,
        updated_at: record.updated_at,
        meta: record.meta,
        status: record.status,
        is_active,
    }
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}
