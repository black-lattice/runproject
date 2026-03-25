use crate::modules::codex::accounts::auth::read_meta_from_auth_text;
use crate::modules::codex::accounts::status::read_fresh_status_from_home;
use crate::modules::codex::accounts::storage::{
    global_codex_home, load_all_profile_records, load_profile_record, now_ts, profile_auth_path,
    read_auth_text,
};
use crate::modules::codex::accounts::types::{
    to_profile_dto, CodexAccountArchiveFile, CodexAccountArchiveItem, CodexAccountListResponse,
    CodexAccountMeta, CodexAccountProfileRecord, CodexRateWindow, CodexStatusSnapshot,
};
use std::cmp::Ordering;
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Clone)]
pub(crate) struct AvailableProfileSelection {
    pub record: CodexAccountProfileRecord,
    pub is_active: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct AvailableProfileCandidate {
    pub record: CodexAccountProfileRecord,
    pub is_active: bool,
    pub primary_remaining: u64,
    pub secondary_remaining: u64,
    pub sampled_at: Option<String>,
}

pub(crate) fn build_list_response(app: &AppHandle) -> Result<CodexAccountListResponse, String> {
    let records = load_all_profile_records(app)?;
    let current_global = read_current_global_meta(app).ok();
    let current_global_status = read_current_global_status().ok().flatten();
    let current_profile_name = current_global
        .as_ref()
        .and_then(|meta| match_profile_name(&records, meta));

    let profiles = records
        .into_iter()
        .map(|record| {
            let (record, is_active) = hydrate_record(
                record,
                current_profile_name.as_deref(),
                current_global.as_ref(),
                current_global_status.as_ref(),
            );
            to_profile_dto(record, is_active)
        })
        .collect();

    Ok(CodexAccountListResponse {
        current_global,
        current_global_status,
        current_profile_name,
        profiles,
    })
}

pub(crate) fn build_account_archive(app: &AppHandle) -> Result<CodexAccountArchiveFile, String> {
    let records = load_all_profile_records(app)?;
    let mut profiles = Vec::with_capacity(records.len());

    for record in records {
        let auth_path = profile_auth_path(app, &record.name)?;
        let auth_text = fs::read_to_string(&auth_path)
            .map_err(|error| format!("读取账号认证失败: {}", error))?;
        profiles.push(CodexAccountArchiveItem { record, auth_text });
    }

    Ok(CodexAccountArchiveFile {
        version: 1,
        exported_at: now_ts(),
        profiles,
    })
}

pub(crate) fn select_available_profile(
    app: &AppHandle,
) -> Result<AvailableProfileSelection, String> {
    let records = load_all_profile_records(app)?;
    if records.is_empty() {
        return Err("还没有导入任何 Codex 账号".to_string());
    }

    let current_global = read_current_global_meta(app).ok();
    let current_global_status = read_current_global_status().ok().flatten();
    let current_profile_name = current_global
        .as_ref()
        .and_then(|meta| match_profile_name(&records, meta));

    let mut candidates = records
        .into_iter()
        .map(|record| {
            let (record, is_active) = hydrate_record(
                record,
                current_profile_name.as_deref(),
                current_global.as_ref(),
                current_global_status.as_ref(),
            );
            build_available_candidate(record, is_active)
        })
        .flatten()
        .collect::<Vec<_>>();

    candidates.sort_by(compare_available_candidate);

    let best = candidates.into_iter().next().ok_or_else(|| {
        "没有检测到还有额度的账号。请先让目标账号产生一次额度采样，或同步最新登录状态。".to_string()
    })?;

    Ok(AvailableProfileSelection {
        record: best.record,
        is_active: best.is_active,
    })
}

pub(crate) fn is_profile_active(app: &AppHandle, profile_name: &str) -> Result<bool, String> {
    let current = read_current_global_meta(app)?;
    let records = load_all_profile_records(app)?;
    Ok(match_profile_name(&records, &current)
        .map(|name| name == profile_name)
        .unwrap_or(false))
}

pub(crate) fn read_current_managed_snapshot(
    app: &AppHandle,
) -> Result<(String, String, CodexStatusSnapshot, CodexAccountMeta), String> {
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    let current_meta = read_meta_from_auth_text(&auth_text)?;
    let records = load_all_profile_records(app)?;
    let current_name = match_profile_name(&records, &current_meta)
        .ok_or_else(|| "当前全局 Codex 账号未纳入管理".to_string())?;
    let current_record = load_profile_record(app, &current_name)?;
    let current_status =
        read_fresh_status_from_home(&global_home)?.unwrap_or_else(|| current_record.status.clone());
    Ok((current_name, auth_text, current_status, current_meta))
}

pub(crate) fn read_current_global_meta(app: &AppHandle) -> Result<CodexAccountMeta, String> {
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

pub(crate) fn read_current_global_status() -> Result<Option<CodexStatusSnapshot>, String> {
    let global_home = global_codex_home()?;
    read_fresh_status_from_home(&global_home)
}

pub(crate) fn build_available_candidate(
    record: CodexAccountProfileRecord,
    is_active: bool,
) -> Option<AvailableProfileCandidate> {
    if !has_remaining_quota(&record.status) {
        return None;
    }

    Some(AvailableProfileCandidate {
        primary_remaining: remaining_percent(record.status.primary.as_ref()),
        secondary_remaining: remaining_percent(record.status.secondary.as_ref()),
        sampled_at: record.status.sampled_at.clone(),
        record,
        is_active,
    })
}

pub(crate) fn has_remaining_quota(status: &CodexStatusSnapshot) -> bool {
    let primary_remaining = remaining_percent_optional(status.primary.as_ref());
    let secondary_remaining = remaining_percent_optional(status.secondary.as_ref());
    let has_any_window = primary_remaining.is_some() || secondary_remaining.is_some();

    if !has_any_window {
        return false;
    }

    if primary_remaining == Some(0) || secondary_remaining == Some(0) {
        return false;
    }

    true
}

pub(crate) fn compare_available_candidate(
    left: &AvailableProfileCandidate,
    right: &AvailableProfileCandidate,
) -> Ordering {
    right
        .is_active
        .cmp(&left.is_active)
        .then_with(|| right.secondary_remaining.cmp(&left.secondary_remaining))
        .then_with(|| right.primary_remaining.cmp(&left.primary_remaining))
        .then_with(|| {
            right
                .sampled_at
                .as_deref()
                .unwrap_or("")
                .cmp(left.sampled_at.as_deref().unwrap_or(""))
        })
        .then_with(|| right.record.updated_at.cmp(&left.record.updated_at))
        .then_with(|| left.record.name.cmp(&right.record.name))
}

fn hydrate_record(
    mut record: CodexAccountProfileRecord,
    current_profile_name: Option<&str>,
    current_global: Option<&CodexAccountMeta>,
    current_global_status: Option<&CodexStatusSnapshot>,
) -> (CodexAccountProfileRecord, bool) {
    let is_active = current_profile_name
        .map(|name| name == record.name)
        .unwrap_or(false);
    if is_active {
        if let Some(current_meta) = current_global {
            record.meta = current_meta.clone();
        }
        if let Some(status) = current_global_status {
            record.status = status.clone();
        }
    }
    (record, is_active)
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

pub(crate) fn metas_match(left: &CodexAccountMeta, right: &CodexAccountMeta) -> bool {
    let left_account = left.account_id.as_deref().unwrap_or("").trim();
    let right_account = right.account_id.as_deref().unwrap_or("").trim();
    if !left_account.is_empty() && !right_account.is_empty() && left_account == right_account {
        return true;
    }

    let left_email = left.email.as_deref().unwrap_or("").trim().to_lowercase();
    let right_email = right.email.as_deref().unwrap_or("").trim().to_lowercase();

    !left_email.is_empty() && !right_email.is_empty() && left_email == right_email
}

fn remaining_percent(window: Option<&CodexRateWindow>) -> u64 {
    remaining_percent_optional(window).unwrap_or(0)
}

fn remaining_percent_optional(window: Option<&CodexRateWindow>) -> Option<u64> {
    window.map(|item| item.remaining_percent.min(100))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_status(
        primary: Option<u64>,
        secondary: Option<u64>,
        sampled_at: &str,
    ) -> CodexStatusSnapshot {
        CodexStatusSnapshot {
            sampled_at: Some(sampled_at.to_string()),
            primary: primary.map(|remaining_percent| CodexRateWindow {
                used_percent: 100_u64.saturating_sub(remaining_percent.min(100)),
                remaining_percent,
                window_minutes: Some(300),
                resets_at: Some(1),
            }),
            secondary: secondary.map(|remaining_percent| CodexRateWindow {
                used_percent: 100_u64.saturating_sub(remaining_percent.min(100)),
                remaining_percent,
                window_minutes: Some(10_080),
                resets_at: Some(1),
            }),
        }
    }

    fn build_record(
        name: &str,
        status: CodexStatusSnapshot,
        updated_at: u64,
    ) -> CodexAccountProfileRecord {
        CodexAccountProfileRecord {
            name: name.to_string(),
            created_at: 1,
            updated_at,
            meta: CodexAccountMeta::default(),
            status,
        }
    }

    #[test]
    fn remaining_quota_requires_known_windows_and_non_zero_remaining() {
        assert!(!has_remaining_quota(&CodexStatusSnapshot::default()));
        assert!(!has_remaining_quota(&build_status(
            Some(0),
            Some(80),
            "2026-03-24T00:00:00Z"
        )));
        assert!(!has_remaining_quota(&build_status(
            Some(30),
            Some(0),
            "2026-03-24T00:00:00Z"
        )));
        assert!(has_remaining_quota(&build_status(
            Some(30),
            Some(80),
            "2026-03-24T00:00:00Z"
        )));
        assert!(has_remaining_quota(&build_status(
            Some(30),
            None,
            "2026-03-24T00:00:00Z"
        )));
    }

    #[test]
    fn available_candidate_prefers_active_then_more_remaining_quota() {
        let mut candidates = vec![
            build_available_candidate(
                build_record(
                    "alpha",
                    build_status(Some(60), Some(40), "2026-03-24T00:00:00Z"),
                    10,
                ),
                false,
            )
            .unwrap(),
            build_available_candidate(
                build_record(
                    "beta",
                    build_status(Some(20), Some(90), "2026-03-24T01:00:00Z"),
                    20,
                ),
                false,
            )
            .unwrap(),
            build_available_candidate(
                build_record(
                    "current",
                    build_status(Some(10), Some(10), "2026-03-24T02:00:00Z"),
                    30,
                ),
                true,
            )
            .unwrap(),
        ];

        candidates.sort_by(compare_available_candidate);

        assert_eq!(candidates[0].record.name, "current");

        candidates[0].is_active = false;
        candidates.sort_by(compare_available_candidate);

        assert_eq!(candidates[0].record.name, "beta");
    }
}
