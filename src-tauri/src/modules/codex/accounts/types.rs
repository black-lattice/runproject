use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountMeta {
    pub auth_mode: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub plan_type: Option<String>,
    pub subscription_active_until: Option<String>,
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
    pub current_global_status: Option<CodexStatusSnapshot>,
    pub current_profile_name: Option<String>,
    pub profiles: Vec<CodexAccountProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexAccountArchiveItem {
    pub record: CodexAccountProfileRecord,
    pub auth_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexAccountArchiveFile {
    pub version: u32,
    pub exported_at: u64,
    pub profiles: Vec<CodexAccountArchiveItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountExportResult {
    pub path: String,
    pub exported_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountImportResult {
    pub imported_count: usize,
    pub profile_names: Vec<String>,
}

pub(crate) fn to_profile_dto(
    record: CodexAccountProfileRecord,
    is_active: bool,
) -> CodexAccountProfile {
    CodexAccountProfile {
        name: record.name,
        created_at: record.created_at,
        updated_at: record.updated_at,
        meta: record.meta,
        status: record.status,
        is_active,
    }
}
