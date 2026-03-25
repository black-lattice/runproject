use crate::modules::codex::accounts::auth::read_meta_from_auth_text;
use crate::modules::codex::accounts::logic::{
    build_account_archive, build_list_response, is_profile_active, metas_match,
    read_current_managed_snapshot, select_available_profile,
};
use crate::modules::codex::accounts::status::{
    read_fresh_status_from_home, read_latest_status_from_home,
};
use crate::modules::codex::accounts::storage::{
    build_unique_profile_name, global_codex_home, load_all_profile_records, load_profile_record,
    now_ts, read_auth_text, read_profile_auth_text, sanitize_profile_name, save_profile_snapshot,
    write_global_auth_text,
};
use crate::modules::codex::accounts::types::{
    to_profile_dto, CodexAccountArchiveFile, CodexAccountExportResult, CodexAccountImportResult,
    CodexAccountListResponse, CodexAccountMeta, CodexAccountProfile, CodexAccountProfileRecord,
};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub fn codex_account_list(app: AppHandle) -> Result<CodexAccountListResponse, String> {
    build_list_response(&app)
}

#[tauri::command]
pub fn codex_account_import_current(app: AppHandle) -> Result<CodexAccountProfile, String> {
    let global_home = global_codex_home()?;
    let auth_text = read_auth_text(&global_home)?;
    let meta = read_meta_from_auth_text(&auth_text)?;
    let all_records = load_all_profile_records(&app)?;
    let matched_record = all_records
        .iter()
        .find(|record| metas_match(&record.meta, &meta))
        .cloned();
    let profile_name = matched_record
        .as_ref()
        .map(|record| record.name.clone())
        .unwrap_or_else(|| {
            let existing_names = all_records
                .iter()
                .map(|record| record.name.clone())
                .collect::<Vec<_>>();
            build_unique_profile_name(&existing_names, &derive_profile_name(&meta))
        });
    let existing = matched_record.or_else(|| load_profile_record(&app, &profile_name).ok());
    let status = read_fresh_status_from_home(&global_home)?
        .or_else(|| existing.as_ref().map(|item| item.status.clone()))
        .unwrap_or_default();
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

fn derive_profile_name(meta: &CodexAccountMeta) -> String {
    meta.email
        .clone()
        .or(meta.account_id.clone())
        .map(|value| sanitize_profile_name(&value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("账号-{}", now_ts()))
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
    if !metas_match(&existing.meta, &meta) {
        return Err(format!(
            "当前登录账号与卡片账号不一致，无法刷新 {}。请先切换到对应账号后再刷新。",
            profile_name
        ));
    }
    let status = read_latest_status_from_home(&global_home)?.ok_or_else(|| {
        "当前 Codex 会话还没有可用额度数据，请先在终端产生一次请求后再刷新。".to_string()
    })?;
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
    switch_profile(&app, &profile_name)
}

#[tauri::command]
pub fn codex_account_switch_to_available(app: AppHandle) -> Result<CodexAccountProfile, String> {
    let selection = select_available_profile(&app)?;

    if selection.is_active {
        return Ok(to_profile_dto(selection.record, true));
    }

    switch_profile(&app, &selection.record.name)
}

#[tauri::command]
pub fn codex_account_export_all(
    app: AppHandle,
    path: String,
) -> Result<CodexAccountExportResult, String> {
    let archive = build_account_archive(&app)?;
    let archive_path = PathBuf::from(&path);
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建导出目录失败: {}", error))?;
    }

    let content = serde_json::to_string_pretty(&archive)
        .map_err(|error| format!("序列化账号备份失败: {}", error))?;
    fs::write(&archive_path, content).map_err(|error| format!("写入账号备份失败: {}", error))?;

    Ok(CodexAccountExportResult {
        path,
        exported_count: archive.profiles.len(),
    })
}

#[tauri::command]
pub fn codex_account_import_archive(
    app: AppHandle,
    path: String,
) -> Result<CodexAccountImportResult, String> {
    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取账号备份失败: {}", error))?;
    let archive = serde_json::from_str::<CodexAccountArchiveFile>(&content)
        .map_err(|error| format!("解析账号备份失败: {}", error))?;

    if archive.version != 1 {
        return Err(format!("不支持的账号备份版本: {}", archive.version));
    }

    let mut profile_names = BTreeSet::new();
    for item in archive.profiles {
        if item.auth_text.trim().is_empty() {
            return Err("账号备份缺少 auth.json 内容".to_string());
        }

        let mut record = item.record;
        let profile_name = sanitize_profile_name(&record.name);
        record.name = profile_name.clone();
        if record.created_at == 0 {
            record.created_at = now_ts();
        }
        if record.updated_at == 0 {
            record.updated_at = now_ts();
        }

        save_profile_snapshot(&app, &record, &item.auth_text)?;
        profile_names.insert(profile_name);
    }

    Ok(CodexAccountImportResult {
        imported_count: profile_names.len(),
        profile_names: profile_names.into_iter().collect(),
    })
}

fn switch_profile(app: &AppHandle, profile_name: &str) -> Result<CodexAccountProfile, String> {
    let target_name = sanitize_profile_name(profile_name);
    let target_record = load_profile_record(app, &target_name)?;
    let target_auth_text = read_profile_auth_text(app, &target_name)?;

    if let Ok((current_name, current_auth_text, current_status, current_meta)) =
        read_current_managed_snapshot(app)
    {
        if current_name != target_name {
            let current_record = load_profile_record(app, &current_name)?;
            let synced_record = CodexAccountProfileRecord {
                name: current_name.clone(),
                created_at: current_record.created_at,
                updated_at: now_ts(),
                meta: current_meta,
                status: current_status,
            };
            save_profile_snapshot(app, &synced_record, &current_auth_text)?;
        }
    }

    write_global_auth_text(&target_auth_text)?;
    Ok(to_profile_dto(target_record, true))
}
