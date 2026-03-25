use crate::modules::codex::accounts::types::CodexAccountProfileRecord;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub(crate) const PROFILE_FILE: &str = "profile.json";
pub(crate) const AUTH_FILE: &str = "auth.json";

pub(crate) fn save_profile_snapshot(
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

pub(crate) fn load_all_profile_records(
    app: &AppHandle,
) -> Result<Vec<CodexAccountProfileRecord>, String> {
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

pub(crate) fn load_profile_record(
    app: &AppHandle,
    profile_name: &str,
) -> Result<CodexAccountProfileRecord, String> {
    let profile_path = profile_dir(app, profile_name)?.join(PROFILE_FILE);
    let content = fs::read_to_string(&profile_path)
        .map_err(|error| format!("读取账号信息失败: {}", error))?;
    serde_json::from_str::<CodexAccountProfileRecord>(&content)
        .map_err(|error| format!("解析账号信息失败: {}", error))
}

pub(crate) fn read_profile_auth_text(
    app: &AppHandle,
    profile_name: &str,
) -> Result<String, String> {
    let auth_path = profile_auth_path(app, profile_name)?;
    fs::read_to_string(&auth_path).map_err(|error| format!("读取账号快照失败: {}", error))
}

pub(crate) fn write_global_auth_text(auth_text: &str) -> Result<(), String> {
    let global_auth_path = global_codex_home()?.join(AUTH_FILE);
    if let Some(parent) = global_auth_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 Codex 目录失败: {}", error))?;
    }
    fs::write(&global_auth_path, auth_text)
        .map_err(|error| format!("写入全局 Codex 认证失败: {}", error))
}

pub(crate) fn profile_auth_path(app: &AppHandle, profile_name: &str) -> Result<PathBuf, String> {
    Ok(profile_dir(app, profile_name)?.join(AUTH_FILE))
}

pub(crate) fn profiles_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {}", error))?;
    Ok(app_data.join("codex_accounts").join("profiles"))
}

pub(crate) fn global_codex_home() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "无法获取 HOME 环境变量".to_string())?;
    Ok(Path::new(&home).join(".codex"))
}

pub(crate) fn read_auth_text(home_dir: &Path) -> Result<String, String> {
    let auth_path = home_dir.join(AUTH_FILE);
    fs::read_to_string(&auth_path).map_err(|error| format!("读取 Codex 认证文件失败: {}", error))
}

pub(crate) fn sanitize_profile_name(input: &str) -> String {
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

pub(crate) fn build_unique_profile_name(existing_names: &[String], preferred_name: &str) -> String {
    let base_name = sanitize_profile_name(preferred_name);
    if !existing_names.iter().any(|name| name == &base_name) {
        return base_name;
    }

    let mut index = 2usize;
    loop {
        let candidate = format!("{}-{}", base_name, index);
        if !existing_names.iter().any(|name| name == &candidate) {
            return candidate;
        }
        index += 1;
    }
}

pub(crate) fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn profile_dir(app: &AppHandle, profile_name: &str) -> Result<PathBuf, String> {
    Ok(profiles_root(app)?.join(profile_name))
}
