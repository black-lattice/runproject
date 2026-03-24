use crate::modules::agent::types::{AgentMessage, AgentSettings};
use async_openai::config::OpenAIConfig;
use async_openai::types::{
    ChatCompletionRequestAssistantMessageArgs, ChatCompletionRequestAssistantMessageContent,
    ChatCompletionRequestAssistantMessageContentPart, ChatCompletionRequestMessage,
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestSystemMessageContent,
    ChatCompletionRequestUserMessageArgs, ChatCompletionRequestUserMessageContent,
};
use async_openai::Client;

pub fn build_client(settings: &AgentSettings) -> Result<Client<OpenAIConfig>, String> {
    let mut config = OpenAIConfig::new().with_api_key(settings.api_key.clone());
    let base_url = if settings.provider == "deepseek" {
        settings
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
    } else {
        let u = settings.base_url.clone().unwrap_or_default();
        if u.is_empty() {
            "https://api.openai.com/v1".to_string()
        } else {
            u
        }
    };
    if !base_url.is_empty() {
        config = config.with_api_base(base_url);
    }
    Ok(Client::with_config(config))
}

pub fn build_messages_with_reasoning(
    history: &[AgentMessage],
    content: &str,
    system_prompt: &str,
) -> Vec<ChatCompletionRequestMessage> {
    let mut messages = Vec::new();
    if !system_prompt.trim().is_empty() {
        let system = ChatCompletionRequestSystemMessageArgs::default()
            .content(ChatCompletionRequestSystemMessageContent::Text(
                system_prompt.to_string(),
            ))
            .build()
            .unwrap();
        messages.push(ChatCompletionRequestMessage::System(system));
    }

    for message in history {
        match message.role.as_str() {
            "assistant" => {
                let assistant = ChatCompletionRequestAssistantMessageArgs::default()
                    .content(ChatCompletionRequestAssistantMessageContent::Text(
                        message.content.clone(),
                    ))
                    .build()
                    .unwrap();
                messages.push(ChatCompletionRequestMessage::Assistant(assistant));
            }
            "user" => {
                let user = ChatCompletionRequestUserMessageArgs::default()
                    .content(ChatCompletionRequestUserMessageContent::Text(
                        message.content.clone(),
                    ))
                    .build()
                    .unwrap();
                messages.push(ChatCompletionRequestMessage::User(user));
            }
            _ => {}
        }
    }

    let user = ChatCompletionRequestUserMessageArgs::default()
        .content(ChatCompletionRequestUserMessageContent::Text(
            content.to_string(),
        ))
        .build()
        .unwrap();
    messages.push(ChatCompletionRequestMessage::User(user));
    messages
}

pub fn extract_assistant_text(
    content: &ChatCompletionRequestAssistantMessageContent,
) -> Option<String> {
    match content {
        ChatCompletionRequestAssistantMessageContent::Text(text) => Some(text.clone()),
        ChatCompletionRequestAssistantMessageContent::Array(parts) => {
            let mut merged = String::new();
            for part in parts {
                if let ChatCompletionRequestAssistantMessageContentPart::Text(text_part) = part {
                    merged.push_str(&text_part.text);
                }
            }
            if merged.is_empty() {
                None
            } else {
                Some(merged)
            }
        }
    }
}
