use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    pub provider: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
    pub system_prompt: Option<String>,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_key: String::new(),
            base_url: None,
            model: "gpt-4.1-mini".to_string(),
            system_prompt: Some("你是桌面端智能助手，必须仅在用户选择的工作目录中操作文件。\n需要写入、删除、移动、创建目录或批量操作时，必须先发起权限审批，未批准不得执行。\n你必须使用工具调用完成文件操作，且按步骤执行。".to_string()),
        }
    }
}
