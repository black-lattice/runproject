use async_openai::Client;
use async_openai::config::OpenAIConfig;
use async_openai::types::{ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestSystemMessageContent, ChatCompletionRequestAssistantMessageArgs, ChatCompletionRequestAssistantMessageContent, ChatCompletionRequestUserMessageArgs, ChatCompletionRequestUserMessageContent, ChatCompletionRequestAssistantMessageContentPart};
use crate::modules::agent::types::{AgentMessage, AgentSettings};

const DEFAULT_SYSTEM_PROMPT: &str = "你是桌面端智能助手，必须仅在用户选择的工作目录中操作文件。\n需要写入、删除、移动、创建目录或批量操作时，必须先发起权限审批，未批准不得执行。\n你必须使用工具调用完成文件操作，且按步骤执行。 ஒன்றிணைக்க";

pub fn build_client(settings: &AgentSettings) -> Result<Client<OpenAIConfig>, String> {
    let mut config = OpenAIConfig::new().with_api_key(settings.api_key.clone());
    let base_url = if settings.provider == "deepseek" {
        settings.base_url.clone().unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
    } else {
        let u = settings.base_url.clone().unwrap_or_default();
        if u.is_empty() { "https://api.openai.com/v1".to_string() } else { u }
    };
    if !base_url.is_empty() { config = config.with_api_base(base_url); }
    Ok(Client::with_config(config))
}

pub fn build_messages_with_reasoning(history: &[AgentMessage], content: &str) -> Vec<ChatCompletionRequestMessage> {
    let mut messages = Vec::new();
    let system = ChatCompletionRequestSystemMessageArgs::default()
        .content(ChatCompletionRequestSystemMessageContent::Text(DEFAULT_SYSTEM_PROMPT.to_string()))
        .build().unwrap();
    messages.push(ChatCompletionRequestMessage::System(system));

    for message in history {
        match message.role.as_str() {
            "assistant" => {
                let assistant = ChatCompletionRequestAssistantMessageArgs::default()
                    .content(ChatCompletionRequestAssistantMessageContent::Text(message.content.clone()))
                    .build().unwrap();
                messages.push(ChatCompletionRequestMessage::Assistant(assistant));
            }
            "user" => {
                let user = ChatCompletionRequestUserMessageArgs::default()
                    .content(ChatCompletionRequestUserMessageContent::Text(message.content.clone()))
                    .build().unwrap();
                messages.push(ChatCompletionRequestMessage::User(user));
            }
            _ => {}
        }
    }

    let user = ChatCompletionRequestUserMessageArgs::default()
        .content(ChatCompletionRequestUserMessageContent::Text(content.to_string()))
        .build().unwrap();
    messages.push(ChatCompletionRequestMessage::User(user));
    messages
}

pub fn extract_assistant_text(content: &ChatCompletionRequestAssistantMessageContent) -> Option<String> {
    match content {
        ChatCompletionRequestAssistantMessageContent::Text(text) => Some(text.clone()),
        ChatCompletionRequestAssistantMessageContent::Array(parts) => {
            let mut merged = String::new();
            for part in parts {
                if let ChatCompletionRequestAssistantMessageContentPart::Text(text_part) = part {
                    merged.push_str(&text_part.text);
                }
            }
            if merged.is_empty() { None } else { Some(merged) }
        }
    }
}
