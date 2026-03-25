use crate::modules::codex::accounts::storage::AUTH_FILE;
use crate::modules::codex::accounts::types::{CodexRateWindow, CodexStatusSnapshot};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn read_fresh_status_from_home(
    home_dir: &Path,
) -> Result<Option<CodexStatusSnapshot>, String> {
    let auth_modified_at = fs::metadata(home_dir.join(AUTH_FILE))
        .and_then(|meta| meta.modified())
        .map_err(|error| format!("读取当前 Codex 认证时间失败: {}", error))?;
    let (snapshot, status_event_at) = read_latest_status_from_home_with_source(home_dir)?;

    Ok(status_event_at
        .filter(|event_at| *event_at >= auth_modified_at)
        .map(|_| snapshot))
}

pub(crate) fn read_latest_status_from_home(
    home_dir: &Path,
) -> Result<Option<CodexStatusSnapshot>, String> {
    let (snapshot, status_event_at) = read_latest_status_from_home_with_source(home_dir)?;
    Ok(status_event_at.map(|_| snapshot))
}

fn read_latest_status_from_home_with_source(
    home_dir: &Path,
) -> Result<(CodexStatusSnapshot, Option<SystemTime>), String> {
    let sessions_dir = home_dir.join("sessions");
    if !sessions_dir.exists() {
        return Ok((CodexStatusSnapshot::default(), None));
    }

    let mut jsonl_files = Vec::new();
    collect_jsonl_files(&sessions_dir, &mut jsonl_files)?;

    let mut latest_timestamp: Option<String> = None;
    let mut latest_snapshot = CodexStatusSnapshot::default();
    let mut latest_status_event_at: Option<SystemTime> = None;

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

            let Some(timestamp) = item
                .get("timestamp")
                .and_then(Value::as_str)
                .map(str::to_string)
            else {
                continue;
            };

            let should_replace = latest_timestamp
                .as_ref()
                .map(|current| timestamp > *current)
                .unwrap_or(true);

            if should_replace {
                latest_timestamp = Some(timestamp.clone());
                latest_status_event_at = parse_timestamp_to_system_time(&timestamp)
                    .or_else(|| fs::metadata(&file).and_then(|meta| meta.modified()).ok());
                latest_snapshot = CodexStatusSnapshot {
                    sampled_at: Some(timestamp),
                    primary: parse_window(rate_limits.get("primary")),
                    secondary: parse_window(rate_limits.get("secondary")),
                };
            }
        }
    }

    Ok((latest_snapshot, latest_status_event_at))
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

// 优先使用 token_count 事件自身的时间，避免只看文件修改时间导致错过最新额度状态。
fn parse_timestamp_to_system_time(value: &str) -> Option<SystemTime> {
    let parsed = DateTime::parse_from_rfc3339(value).ok()?;
    let timestamp = parsed.with_timezone(&Utc).timestamp();
    if timestamp < 0 {
        return None;
    }

    Some(UNIX_EPOCH + std::time::Duration::from_secs(timestamp as u64))
}
