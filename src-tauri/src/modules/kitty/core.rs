use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Kitty标签页状态
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TabStatus {
    Running,
    Completed,
    Error,
    Terminated,
}

impl TabStatus {
    pub fn to_string(&self) -> &'static str {
        match self {
            TabStatus::Running => "running",
            TabStatus::Completed => "completed",
            TabStatus::Error => "error",
            TabStatus::Terminated => "terminated",
        }
    }
}

// Kitty标签页信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KittyTab {
    pub id: String,
    pub title: String,
    pub project_name: String,
    pub command_name: String,
    pub working_dir: String,
    pub command: String,
    pub socket_path: String,
    pub status: TabStatus,
    pub created_at: u64,
    pub pid: Option<u32>,
}

// Kitty实例配置
#[derive(Debug, Clone)]
pub struct KittyConfig {
    pub socket_prefix: String,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
    pub config_file: Option<String>,
}

impl Default for KittyConfig {
    fn default() -> Self {
        Self {
            socket_prefix: "kitty-runproject".to_string(),
            max_retries: 20,
            retry_delay_ms: 500,
            config_file: Some("NONE".to_string()),
        }
    }
}

// 全局Kitty管理器状态
lazy_static::lazy_static! {
    pub static ref KITTY_TAB_MANAGER: Arc<Mutex<HashMap<String, KittyTab>>> = Arc::new(Mutex::new(HashMap::new()));
    pub static ref PROCESS_MANAGER: Arc<Mutex<HashMap<String, std::process::Child>>> = Arc::new(Mutex::new(HashMap::new()));
}

// 工具函数
pub fn sanitize_command_id(command_id: &str) -> String {
    command_id.replace('-', "_").replace(' ', "_")
}

pub fn get_current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
