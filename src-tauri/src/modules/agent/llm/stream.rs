use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use futures::StreamExt;
use serde_json::Value;
use tauri::AppHandle;
use async_openai::types::{
    ChatCompletionMessageToolCall, ChatCompletionRequestAssistantMessageArgs,
    ChatCompletionRequestAssistantMessageContent, ChatCompletionRequestMessage,
    ChatCompletionRequestToolMessageArgs,
    ChatCompletionRequestToolMessageContent, ChatCompletionToolType,
    FunctionCall,
};

use crate::modules::agent::types::{AgentMessage, ApprovalState};
use crate::modules::agent::state::SESSIONS;
use crate::modules::agent::utils::{emit_event, now_ms};
use crate::modules::agent::settings::load_settings;
use crate::modules::agent::mcp::ensure_mcp_clients;
use crate::modules::agent::tools::ToolContext;

use super::tools::build_tools_combined;
use super::execution::call_tool;
use super::messages::{build_client, build_messages_with_reasoning, extract_assistant_text};

pub async fn stream_agent_response(
    app: AppHandle,
    session_id: String,
    content: String,
    workspace: PathBuf,
    approvals: Arc<ApprovalState>,
    history_snapshot: Vec<AgentMessage>,
) -> Result<(), String> {
    let settings = load_settings(&app)?;
    if settings.api_key.trim().is_empty() {
        return Err("API Key 为空，请先在设置中配置".to_string());
    }

    let mcp_tools_map = {
        let sessions = SESSIONS.lock().map_err(|_| "获取锁失败".to_string())?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| "会话不存在".to_string())?;
        ensure_mcp_clients(&app, session)?
    };

    let system_prompt = settings.system_prompt.clone().unwrap_or_else(|| {
        "你是桌面端智能助手，必须仅在用户选择的工作目录中操作文件。\n需要写入、删除、移动、创建目录或批量操作时，必须先发起权限审批，未批准不得执行。\n你必须使用工具调用完成文件操作，且按步骤执行。".to_string()
    });

    let mut messages = build_messages_with_reasoning(&history_snapshot, &content, &system_prompt);
    let mut current_reasoning_map: HashMap<usize, String> = HashMap::new();

    let http_client = reqwest::Client::new();
    let base_url = if settings.provider == "deepseek" {
        settings.base_url.clone().unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
    } else {
        let u = settings.base_url.clone().unwrap_or_default();
        if u.is_empty() { "https://api.openai.com/v1".to_string() } else { u }
    };

    let is_reasoner = settings.model.contains("reasoner") || settings.model.contains("r1");

    for iter in 0..8 {
        println!("[AGENT] LLM Iteration {}", iter);
        
        let mut messages_json = Vec::new();
        for (idx, msg) in messages.iter().enumerate() {
            let mut val = serde_json::to_value(msg).map_err(|e| e.to_string())?;
            if val.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                if let Some(reasoning) = current_reasoning_map.get(&idx) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert("reasoning_content".to_string(), Value::String(reasoning.clone()));
                    }
                }
            }
            messages_json.push(val);
        }

        let mut request_body = serde_json::json!({
            "model": settings.model,
            "messages": messages_json,
            "stream": true
        });

        // Always add tools, even for Reasoner
        let tools_list = build_tools_combined(&mcp_tools_map);
        if !tools_list.is_empty() {
            request_body.as_object_mut().unwrap().insert("tools".to_string(), serde_json::to_value(tools_list).unwrap());
            request_body.as_object_mut().unwrap().insert("tool_choice".to_string(), serde_json::json!("auto"));
        }

        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let response = http_client.post(url)
            .header("Authorization", format!("Bearer {}", settings.api_key))
            .json(&request_body)
            .send().await
            .map_err(|e| format!("网络请求失败: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("AI 服务返回错误 ({}): {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut assistant_text = String::new();
        let mut assistant_reasoning = String::new();
        let mut pending_tool_calls: HashMap<u64, (Option<String>, String, String)> = HashMap::new();
        let mut finish_reason: Option<String> = None;
        let mut line_buffer = String::new();

        while let Some(item) = stream.next().await {
            let bytes = item.map_err(|e| format!("流中断: {}", e))?;
            let data = String::from_utf8_lossy(&bytes);
            line_buffer.push_str(&data);

            while let Some(line_end) = line_buffer.find('\n') {
                let line = line_buffer[..line_end].trim().to_string();
                line_buffer = line_buffer[line_end + 1..].to_string();

                if line.starts_with("data: ") {
                    let json_str = line.trim_start_matches("data: ").trim();
                    if json_str == "[DONE]" { break; }
                    
                    if let Ok(val) = serde_json::from_str::<Value>(json_str) {
                        if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                            if let Some(choice) = choices.get(0) {
                                if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                                    finish_reason = Some(fr.to_string());
                                }
                                if let Some(delta) = choice.get("delta") {
                                    if let Some(rc) = delta.get("reasoning_content").and_then(|r| r.as_str()) {
                                        assistant_reasoning.push_str(rc);
                                        emit_event(&app, &session_id, "delta", Some(serde_json::json!({ "reasoning": rc })));
                                    }
                                    if let Some(c) = delta.get("content").and_then(|c| c.as_str()) {
                                        assistant_text.push_str(c);
                                        emit_event(&app, &session_id, "delta", Some(serde_json::json!({ "text": c })));
                                    }
                                    if let Some(tc_array) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                                        for tc in tc_array {
                                            let index = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                                            let id = tc.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
                                            let entry = pending_tool_calls.entry(index).or_insert((None, String::new(), String::new()));
                                            if let Some(i) = id { entry.0 = Some(i); }
                                            if let Some(func) = tc.get("function") {
                                                if let Some(name) = func.get("name").and_then(|n| n.as_str()) { entry.1.push_str(name); }
                                                if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) { entry.2.push_str(args); }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if !assistant_text.is_empty() || !assistant_reasoning.is_empty() || !pending_tool_calls.is_empty() {
            let mut sessions = SESSIONS.lock().map_err(|_| "锁失败".to_string())?;
            if let Some(session) = sessions.get_mut(&session_id) {
                session.history.push(AgentMessage {
                    role: "assistant".to_string(),
                    content: assistant_text.clone(),
                    reasoning: if assistant_reasoning.is_empty() { None } else { Some(assistant_reasoning.clone()) },
                    timestamp_ms: now_ms(),
                });
            }

            let mut assistant_msg_builder = ChatCompletionRequestAssistantMessageArgs::default();
            if !assistant_text.is_empty() {
                assistant_msg_builder.content(ChatCompletionRequestAssistantMessageContent::Text(assistant_text.clone()));
            }
            if !pending_tool_calls.is_empty() {
                let mut tool_calls = Vec::new();
                let mut sorted_tc: Vec<_> = pending_tool_calls.iter().collect();
                sorted_tc.sort_by_key(|(k, _)| **k);
                for (index, (id_opt, name, args)) in sorted_tc {
                    tool_calls.push(ChatCompletionMessageToolCall {
                        id: id_opt.clone().unwrap_or_else(|| format!("call_{}", index)),
                        r#type: ChatCompletionToolType::Function,
                        function: FunctionCall { name: name.clone(), arguments: args.clone() },
                    });
                }
                assistant_msg_builder.tool_calls(tool_calls);
            }
            
            let assistant_msg = assistant_msg_builder.build().map_err(|e| e.to_string())?;
            let new_msg_idx = messages.len();
            messages.push(ChatCompletionRequestMessage::Assistant(assistant_msg));
            if !assistant_reasoning.is_empty() {
                current_reasoning_map.insert(new_msg_idx, assistant_reasoning);
            }
        }

        if !pending_tool_calls.is_empty() {
            let ctx = ToolContext {
                app: app.clone(),
                session_id: session_id.clone(),
                workspace: workspace.clone(),
                approvals: approvals.clone(),
            };
            let mut sorted_calls: Vec<_> = pending_tool_calls.into_iter().collect();
            sorted_calls.sort_by_key(|(k, _)| *k);

            for (index, (id_opt, tool_name, args_json)) in sorted_calls {
                let call_id = id_opt.unwrap_or_else(|| format!("call_{}", index));
                emit_event(&app, &session_id, "delta", Some(serde_json::json!({ "text": format!("\n> 正在执行工具: {}...\n", tool_name) })));

                let tool_result_val = call_tool(&ctx, &tool_name, &args_json, &mcp_tools_map).await?;
                let mut result_str = tool_result_val.to_string();
                let max_chars = 15000;
                
                if result_str.chars().count() > max_chars {
                    result_str = result_str.chars().take(max_chars).collect::<String>();
                    result_str.push_str("\n... [数据过大已截断]");
                }

                messages.push(ChatCompletionRequestMessage::Tool(
                    ChatCompletionRequestToolMessageArgs::default()
                        .tool_call_id(call_id)
                        .content(ChatCompletionRequestToolMessageContent::Text(result_str))
                        .build()
                        .map_err(|e| e.to_string())?,
                ));
            }
            emit_event(&app, &session_id, "delta", Some(serde_json::json!({ "text": "> 数据已就绪，正在请 AI 进行最后分析...\n" })));
            continue;
        }

        if let Some(reason) = finish_reason {
            if reason != "tool_calls" { break; }
        } else {
            break;
        }
    }

    emit_event(&app, &session_id, "done", None);
    Ok(())
}
