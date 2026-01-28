use crate::modules::codex::connection::{CodexConnection, Framing};
use crate::modules::codex::types::CodexIncomingMessage;
use super::tools::{
    batch_ops, default_auto_approve, delete_path, list_dir, mkdir, move_path, read_file,
    write_file, ApprovalState, PendingAction, ToolContext,
};
use super::types::{AgentMessage, AgentSessionRecord, AgentSettings};
use async_openai::config::OpenAIConfig;
use async_openai::types::{
    ChatCompletionMessageToolCall, ChatCompletionRequestAssistantMessageArgs,
    ChatCompletionRequestAssistantMessageContent, ChatCompletionRequestMessage,
    ChatCompletionRequestSystemMessage, ChatCompletionRequestSystemMessageArgs,
    ChatCompletionRequestSystemMessageContent, ChatCompletionRequestToolMessageArgs,
    ChatCompletionRequestToolMessageContent, ChatCompletionRequestUserMessageArgs,
    ChatCompletionRequestUserMessageContent, ChatCompletionTool, ChatCompletionToolChoiceOption,
    ChatCompletionToolType, CreateChatCompletionRequestArgs, CreateChatCompletionStreamResponse,
    FinishReason, FunctionCall, FunctionObject,
};
use async_openai::Client;
use futures::StreamExt;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

lazy_static! {
    static ref SESSIONS: Arc<Mutex<HashMap<String, AgentSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

struct AgentSession {
    workspace: PathBuf,
    session_file: PathBuf,
    history: Vec<AgentMessage>,
    approvals: Arc<ApprovalState>,
    mcp_clients: Arc<Mutex<HashMap<String, Arc<CodexConnection>>>>,
}

const DEFAULT_SYSTEM_PROMPT: &str = "你是桌面端智能助手，必须仅在用户选择的工作目录中操作文件。\
需要写入、删除、移动、创建目录或批量操作时，必须先发起权限审批，未批准不得执行。\
你必须使用工具调用完成文件操作，且按步骤执行。";

#[tauri::command]
pub fn agent_get_settings(app: AppHandle) -> Result<AgentSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn agent_save_settings(app: AppHandle, settings: AgentSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}

#[tauri::command]
pub fn agent_get_mcp_config(app: AppHandle) -> Result<String, String> {
    let path = mcp_config_path(&app)?;
    if !path.exists() {
        let default_config = serde_json::json!({
            "mcpServers": {}
        });
        return Ok(serde_json::to_string_pretty(&default_config).unwrap());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))
}

#[tauri::command]
pub fn agent_save_mcp_config(app: AppHandle, config: String) -> Result<(), String> {
    let _: Value = serde_json::from_str(&config).map_err(|e| format!("无效的 JSON 格式: {}", e))?;
    let path = mcp_config_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    fs::write(&path, config).map_err(|e| format!("写入 MCP 配置失败: {}", e))?;
    Ok(())
}

fn mcp_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("mcp_config.json"))
}

#[tauri::command]
pub fn agent_start_session(
    app: AppHandle,
    session_id: String,
    workspace: String,
) -> Result<String, String> {
    let workspace_path = validate_workspace(&workspace)?;
    let session_file = create_session_file(&app, &session_id, &workspace)?;

    let approvals = Arc::new(ApprovalState {
        next_id: std::sync::atomic::AtomicU64::new(1),
        pending: Mutex::new(HashMap::new()),
        auto_approve: Mutex::new(default_auto_approve()),
    });

    let history = load_session_history(&session_file).unwrap_or_default();

    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    sessions.insert(
        session_id.clone(),
        AgentSession {
            workspace: workspace_path,
            session_file,
            history,
            approvals,
            mcp_clients: Arc::new(Mutex::new(HashMap::new()))
        },
    );

    emit_event(&app, &session_id, "session-start", None);
    Ok(session_id)
}

fn ensure_mcp_clients(
    app: &AppHandle,
    session: &AgentSession,
) -> Result<HashMap<String, Vec<Value>>, String> {
    let config_str = agent_get_mcp_config(app.clone())?;
    let config: McpConfig =
        serde_json::from_str(&config_str).map_err(|e| format!("解析 MCP 配置失败: {}", e))?;

    let mut clients = session
        .mcp_clients
        .lock()
        .map_err(|_| "获取 MCP 锁失败".to_string())?;
    let mut all_tools = HashMap::new();

    for (name, server_config) in config.mcp_servers {
        if !clients.contains_key(&name) {
            println!("[AGENT] Starting MCP server: {}", name);
            let on_message = Arc::new(|_| {});
            let name_for_err = name.clone();
            let on_stderr = Arc::new(move |err| {
                println!("[AGENT] MCP server {} stderr: {}", name_for_err, err);
            });

            let mut cmd = std::process::Command::new(&server_config.command);
            cmd.args(&server_config.args);

            if let Some(env_map) = &server_config.env {
                for (k, v) in env_map {
                    cmd.env(k, v);
                }
            }

            match CodexConnection::spawn_from_command(
                cmd,
                Framing::Line,
                on_message,
                on_stderr,
            ) {
                Ok(client) => {
                    let handshake_result = (|| -> Result<(), String> {
                        if let Err(e) = client.wait_for_server_ready(Duration::from_secs(10)) {
                            println!("[AGENT] MCP server {} not responding to ping, attempting initialize anyway: {}", name, e);
                        }
                        
                        let init_params = serde_json::json!({
                            "protocolVersion": "2024-11-05",
                            "capabilities": {},
                            "clientInfo": { "name": "runproject-agent", "version": "1.0.0" }
                        });
                        
                        client.send_request_and_wait(
                            "initialize",
                            Some(init_params),
                            Duration::from_secs(10),
                        )?;
                        client.send_notification("initialized", None)?;
                        Ok(())
                    })();

                    if let Err(e) = handshake_result {
                        println!("[AGENT] MCP server {} handshake failed: {}. This server will be skipped.", name, e);
                        let _ = client.terminate();
                        continue;
                    }

                    clients.insert(name.clone(), client);
                },
                Err(e) => {
                    println!("[AGENT] Failed to spawn MCP server {}: {}. Skipping.", name, e);
                    continue;
                }
            }
        }

        // Fetch tools for successfully connected clients
        if let Some(client) = clients.get(&name) {
            let mut tools_result = client.send_request_and_wait("tools/list", None, Duration::from_secs(5));
            
            // Retry once if failed
            if tools_result.is_err() {
                std::thread::sleep(Duration::from_millis(500));
                tools_result = client.send_request_and_wait("tools/list", None, Duration::from_secs(5));
            }

            if let Ok(result) = tools_result {
                if let Some(tools) = result.get("tools").and_then(|t| t.as_array()) {
                    println!("[AGENT] MCP server {} provided {} tools", name, tools.len());
                    all_tools.insert(name.clone(), tools.clone());
                }
            } else {
                println!("[AGENT] Failed to fetch tools from {}: {:?}", name, tools_result.err());
            }
        }
    }

    let all_names: Vec<String> = all_tools.values().flat_map(|v| v.iter().filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))).collect();
    println!("[AGENT] Total discovery: {} MCP tools: {:?}", all_names.len(), all_names);

    Ok(all_tools)
}

#[tauri::command]
pub fn agent_stop_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    if let Some(session) = sessions.remove(&session_id) {
        if let Ok(mcp_clients) = session.mcp_clients.lock() {
            println!("[AGENT] Cleaning up {} MCP clients for session {}", mcp_clients.len(), session_id);
            for (name, client) in mcp_clients.iter() {
                println!("[AGENT] Terminating MCP server: {}", name);
                let _ = client.terminate();
            }
        }
    }
    emit_event(&app, &session_id, "session-stop", None);
    Ok(())
}

#[tauri::command]
pub fn agent_send_message(app: AppHandle, session_id: String, content: String) -> Result<(), String> {
    let (workspace, approvals, history_snapshot) = {
        let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "会话不存在".to_string())?;

        let history_snapshot = session.history.clone();

        let user_message = AgentMessage {
            role: "user".to_string(),
            content: content.clone(),
            reasoning: None,
            timestamp_ms: now_ms(),
        };
        session.history.push(user_message);
        save_session_record(&app, &session_id, session)?;

        (
            session.workspace.clone(),
            session.approvals.clone(),
            history_snapshot,
        )
    };

    let app_clone = app.clone();
    let app_for_error = app.clone();
    let session_id_for_error = session_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = stream_agent_response(
            app_clone,
            session_id.clone(),
            content,
            workspace,
            approvals,
            history_snapshot,
        )
        .await
        {
            emit_event(
                &app_for_error,
                &session_id_for_error,
                "error",
                Some(serde_json::json!({ "error": error })),
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub fn agent_approve_action(
    app: AppHandle,
    session_id: String,
    call_id: u64,
    decision: String,
    remember: bool,
) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "会话不存在".to_string())?;

    let approved = decision.to_lowercase() == "approve" || decision.to_lowercase() == "yes";

    let action = {
        let mut pending = session
            .approvals
            .pending
            .lock()
            .map_err(|_| "获取审批队列失败".to_string())?;
        pending.remove(&call_id)
    };

    if let Some(PendingAction { action_type, responder, .. })
        = action
    {
        if remember && approved {
            if let Ok(mut map) = session.approvals.auto_approve.lock() {
                map.insert(action_type.clone(), true);
            }
        }
        let _ = responder.send(approved);
        emit_event(
            &app,
            &session_id,
            if approved {
                "action-approved"
            } else {
                "action-rejected"
            },
            Some(serde_json::json!({ "callId": call_id, "actionType": action_type })),
        );
    }

    Ok(())
}

async fn stream_agent_response(
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

    let client = build_client(&settings)?;
    let mut messages = build_messages_with_reasoning(&history_snapshot, &content);

    let http_client = reqwest::Client::new();
    let base_url = if settings.provider == "deepseek" {
        settings.base_url.clone().unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
    } else {
        let u = settings.base_url.clone().unwrap_or_default();
        if u.is_empty() { "https://api.openai.com/v1".to_string() } else { u }
    };

    for _ in 0..8 {
        let tools_list = build_tools_combined(&mcp_tools_map);
        let mut messages_json = Vec::new();
        for msg in &messages {
            let mut val = serde_json::to_value(msg).map_err(|e| e.to_string())?;
            if let Some(obj) = val.as_object_mut() {
                if obj.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                    if let ChatCompletionRequestMessage::Assistant(ref assistant) = msg {
                        if let Some(content_text) = assistant.content.as_ref().and_then(|c| extract_assistant_text(c)) {
                             if let Some(matched_msg) = history_snapshot.iter().find(|m| m.role == "assistant" && m.content == content_text) {
                                 if let Some(ref r) = matched_msg.reasoning {
                                     obj.insert("reasoning_content".to_string(), Value::String(r.clone()));
                                 }
                             }
                        }
                    }
                }
            }
            messages_json.push(val);
        }

        let request_json = serde_json::json!({
            "model": settings.model,
            "messages": messages_json,
            "tools": tools_list,
            "tool_choice": "auto",
            "stream": true
        });

        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let mut stream = http_client.post(url)
            .header("Authorization", format!("Bearer {}", settings.api_key))
            .json(&request_json)
            .send().await
            .map_err(|e| format!("请求失败: {}", e))?
            .bytes_stream();

        let mut assistant_text = String::new();
        let mut assistant_reasoning = String::new();
        let mut pending_tool_calls: HashMap<String, (String, String)> = HashMap::new();
        let mut finish_reason: Option<String> = None;

        while let Some(item) = stream.next().await {
            let bytes = item.map_err(|e| format!("读取流失败: {}", e))?;
            let data = String::from_utf8_lossy(&bytes);
            
            for line in data.lines() {
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
                                            let id = tc.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
                                            let index = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                                            if let Some(func) = tc.get("function") {
                                                let name = func.get("name").and_then(|n| n.as_str()).map(|s| s.to_string());
                                                let args = func.get("arguments").and_then(|a| a.as_str()).map(|s| s.to_string());
                                                let call_key = id.unwrap_or_else(|| format!("call_{}", index));
                                                let entry = pending_tool_calls.entry(call_key).or_insert((String::new(), String::new()));
                                                if let Some(n) = name { entry.0 = n; }
                                                if let Some(a) = args { entry.1.push_str(&a); }
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

        if !assistant_text.trim().is_empty() || !assistant_reasoning.trim().is_empty() {
            let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
            if let Some(session) = sessions.get_mut(&session_id) {
                session.history.push(AgentMessage {
                    role: "assistant".to_string(),
                    content: assistant_text.clone(),
                    reasoning: if assistant_reasoning.is_empty() { None } else { Some(assistant_reasoning.clone()) },
                    timestamp_ms: now_ms(),
                });
            }
            let assistant_msg = ChatCompletionRequestAssistantMessageArgs::default()
                .content(ChatCompletionRequestAssistantMessageContent::Text(assistant_text.clone()))
                .build()
                .map_err(|e| format!("构建助手消息失败: {}", e))?;
            messages.push(ChatCompletionRequestMessage::Assistant(assistant_msg));
        }

        if !pending_tool_calls.is_empty() {
            let ctx = ToolContext {
                app: app.clone(),
                session_id: session_id.clone(),
                workspace: workspace.clone(),
                approvals: approvals.clone(),
            };
            let mut tool_call_messages = Vec::new();
            let mut tool_results = Vec::new();
            for (call_id, (tool_name, args_json)) in pending_tool_calls {
                tool_call_messages.push(ChatCompletionMessageToolCall {
                    id: call_id.clone(),
                    r#type: ChatCompletionToolType::Function,
                    function: FunctionCall {
                        name: tool_name.clone(),
                        arguments: args_json.clone(),
                    },
                });
                let tool_result = call_tool(&ctx, &tool_name, &args_json, &mcp_tools_map).await?;
                tool_results.push((call_id, tool_result));
            }
            messages.push(ChatCompletionRequestMessage::Assistant(
                ChatCompletionRequestAssistantMessageArgs::default()
                    .tool_calls(tool_call_messages)
                    .build()
                    .map_err(|e| format!("构建工具调用消息失败: {}", e))?,
            ));
            for (call_id, tool_result) in tool_results {
                messages.push(ChatCompletionRequestMessage::Tool(
                    ChatCompletionRequestToolMessageArgs::default()
                        .tool_call_id(call_id)
                        .content(ChatCompletionRequestToolMessageContent::Text(tool_result.to_string()))
                        .build()
                        .map_err(|e| format!("构建工具响应失败: {}", e))?,
                ));
            }
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

fn build_client(settings: &AgentSettings) -> Result<Client<OpenAIConfig>, String> {
    let mut config = OpenAIConfig::new().with_api_key(settings.api_key.clone());
    let base_url = if settings.provider == "deepseek" {
        settings
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
    } else {
        settings.base_url.clone().unwrap_or_default()
    };
    if !base_url.is_empty() {
        config = config.with_api_base(base_url);
    }
    Ok(Client::with_config(config))
}

fn build_messages_with_reasoning(history: &[AgentMessage], content: &str) -> Vec<ChatCompletionRequestMessage> {
    let mut messages = Vec::new();
    let system = ChatCompletionRequestSystemMessageArgs::default()
        .content(ChatCompletionRequestSystemMessageContent::Text(DEFAULT_SYSTEM_PROMPT.to_string()))
        .build()
        .unwrap();
    messages.push(ChatCompletionRequestMessage::System(system));

    for message in history {
        match message.role.as_str() {
            "assistant" => {
                let assistant = ChatCompletionRequestAssistantMessageArgs::default()
                    .content(ChatCompletionRequestAssistantMessageContent::Text(message.content.clone()))
                    .build()
                    .unwrap();
                messages.push(ChatCompletionRequestMessage::Assistant(assistant));
            }
            "user" => {
                let user = ChatCompletionRequestUserMessageArgs::default()
                    .content(ChatCompletionRequestUserMessageContent::Text(message.content.clone()))
                    .build()
                    .unwrap();
                messages.push(ChatCompletionRequestMessage::User(user));
            }
            _ => {}
        }
    }

    let user = ChatCompletionRequestUserMessageArgs::default()
        .content(ChatCompletionRequestUserMessageContent::Text(content.to_string()))
        .build()
        .unwrap();
    messages.push(ChatCompletionRequestMessage::User(user));
    messages
}

fn build_tools_combined(mcp_tools_map: &HashMap<String, Vec<Value>>) -> Vec<ChatCompletionTool> {
    let mut tools = build_builtin_tools();
    for (_server_name, mcp_tools) in mcp_tools_map {
        for tool_val in mcp_tools {
            if let Some(name) = tool_val.get("name").and_then(|v| v.as_str()) {
                let description = tool_val.get("description").and_then(|v| v.as_str()).unwrap_or_default();
                let parameters = tool_val.get("inputSchema").or_else(|| tool_val.get("input_schema")).cloned().unwrap_or(serde_json::json!({"type": "object", "properties": {}}));
                tools.push(tool_def(name, description, parameters));
            }
        }
    }
    tools
}

fn build_builtin_tools() -> Vec<ChatCompletionTool> {
    vec![
        tool_def("read_file", "读取工作目录内的文件内容", serde_json::json!({"type": "object", "properties": {"path": {"type": "string", "description": "相对工作目录的文件路径"}}, "required": ["path"]})),
        tool_def("list_dir", "列出目录下的文件与子目录", serde_json::json!({"type": "object", "properties": {"path": {"type": "string", "description": "相对工作目录的目录路径"}}, "required": ["path"]})),
        tool_def("write_file", "写入或创建文件（需要审批）", serde_json::json!({"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}, "overwrite": {"type": "boolean", "default": false}}, "required": ["path"]})),
        tool_def("delete_path", "删除文件或目录（需要审批）", serde_json::json!({"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]})),
        tool_def("mkdir", "创建目录（需要审批）", serde_json::json!({"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]})),
        tool_def("move_path", "移动或重命名文件/目录（需要审批）", serde_json::json!({"type": "object", "properties": {"from": {"type": "string"}, "to": {"type": "string"}, "overwrite": {"type": "boolean", "default": false}}, "required": ["from", "to"]})),
        tool_def("batch_file_ops", "批量执行文件操作（需要审批）", serde_json::json!({"type": "object", "properties": {"actions": {"type": "array", "items": {"type": "object", "properties": {"action": {"type": "string"}, "path": {"type": "string"}, "from": {"type": "string"}, "to": {"type": "string"}, "content": {"type": "string"}, "overwrite": {"type": "boolean"}}, "required": ["action"]}}}, "required": ["actions"]})),
    ]
}

fn tool_def(name: &str, description: &str, parameters: Value) -> ChatCompletionTool {
    ChatCompletionTool {
        r#type: ChatCompletionToolType::Function,
        function: FunctionObject {
            name: name.to_string(),
            description: Some(description.to_string()),
            parameters: Some(parameters),
            strict: None,
        },
    }
}

async fn call_tool(ctx: &ToolContext, name: &str, args_json: &str, mcp_tools_map: &HashMap<String, Vec<Value>>) -> Result<Value, String> {
    let args_value = parse_tool_args(args_json)?;
    match name {
        "read_file" => read_file(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "list_dir" => list_dir(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "write_file" => write_file(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "delete_path" => delete_path(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "mkdir" => mkdir(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "move_path" => move_path(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        "batch_file_ops" => batch_ops(ctx, serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?).await,
        _ => {
            for (server_name, mcp_tools) in mcp_tools_map {
                if mcp_tools.iter().any(|t| t.get("name").and_then(|v| v.as_str()) == Some(name)) {
                    let sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
                    let session = sessions.get(&ctx.session_id).ok_or_else(|| "会话不存在".to_string())?;
                    let mcp_clients = session.mcp_clients.lock().map_err(|_| "获取 MCP 锁失败".to_string())?;
                    let client = mcp_clients.get(server_name).ok_or_else(|| format!("MCP 服务器 {} 未连接", server_name))?;
                    let params = serde_json::json!({"name": name, "arguments": args_value});
                    return client.send_request_and_wait("tools/call", Some(params), Duration::from_secs(300));
                }
            }
            Err(format!("未知工具: {}", name))
        }
    }
}

fn parse_tool_args(args_json: &str) -> Result<Value, String> {
    let trimmed = args_json.trim();
    if trimmed.is_empty() { return Ok(Value::Object(serde_json::Map::new())); }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) { return Ok(value); }
    if let Ok(unescaped) = serde_json::from_str::<String>(trimmed) {
        if let Ok(value) = serde_json::from_str::<Value>(&unescaped) { return Ok(value); }
        if let Ok(value) = json5::from_str::<Value>(&unescaped) { return Ok(value); }
    }
    if let Ok(value) = json5::from_str::<Value>(trimmed) { return Ok(value); }
    Err("工具参数解析失败".to_string())
}

fn content_for_history(messages: &[ChatCompletionRequestMessage]) -> String {
    for message in messages.iter().rev() {
        if let ChatCompletionRequestMessage::Assistant(assistant) = message {
            if let Some(content) = assistant.content.as_ref() {
                if let Some(text) = extract_assistant_text(content) {
                    if !text.is_empty() { return text; }
                }
            }
        }
    }
    String::new()
}

fn extract_assistant_text(content: &ChatCompletionRequestAssistantMessageContent) -> Option<String> {
    match content {
        ChatCompletionRequestAssistantMessageContent::Text(text) => Some(text.clone()),
        ChatCompletionRequestAssistantMessageContent::Array(parts) => {
            let mut merged = String::new();
            for part in parts {
                if let async_openai::types::ChatCompletionRequestAssistantMessageContentPart::Text(text_part) = part {
                    merged.push_str(&text_part.text);
                }
            }
            if merged.is_empty() { None } else { Some(merged) }
        }
    }
}

fn load_settings(app: &AppHandle) -> Result<AgentSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        let settings = AgentSettings::default();
        save_settings(app, &settings)?;
        return Ok(settings);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取设置失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {}", e))
}

fn save_settings(app: &AppHandle, settings: &AgentSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建设置目录失败: {}", e))?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入设置失败: {}", e))?;
    Ok(())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("settings.json"))
}

fn create_session_file(app: &AppHandle, session_id: &str, workspace: &str) -> Result<PathBuf, String> {
    let dir = session_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let file_path = dir.join(format!("session-{}.json", session_id));
    if !file_path.exists() {
        let settings = load_settings(app)?;
        let record = AgentSessionRecord {
            id: session_id.to_string(),
            created_at_ms: now_ms(),
            workspace: workspace.to_string(),
            provider: settings.provider,
            model: settings.model,
            messages: Vec::new(),
        };
        let content = serde_json::to_string_pretty(&record).map_err(|e| format!("序列化会话失败: {}", e))?;
        fs::write(&file_path, content).map_err(|e| format!("写入会话失败: {}", e))?;
    }
    Ok(file_path)
}

fn load_session_history(path: &Path) -> Option<Vec<AgentMessage>> {
    let content = fs::read_to_string(path).ok()?;
    let record: AgentSessionRecord = serde_json::from_str(&content).ok()?;
    Some(record.messages)
}

fn save_session_record(app: &AppHandle, session_id: &str, session: &AgentSession) -> Result<(), String> {
    let settings = load_settings(app).unwrap_or_default();
    let record = AgentSessionRecord {
        id: session_id.to_string(),
        created_at_ms: now_ms(),
        workspace: session.workspace.to_string_lossy().to_string(),
        provider: settings.provider,
        model: settings.model,
        messages: session.history.clone(),
    };
    let content = serde_json::to_string_pretty(&record).map_err(|e| format!("序列化会话失败: {}", e))?;
    fs::write(&session.session_file, content).map_err(|e| format!("保存会话失败: {}", e))?;
    Ok(())
}

fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("agent_sessions"))
}

fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() { return Err(format!("工作目录不存在: {}", path.display())); }
    let canonical = path.canonicalize().map_err(|e| format!("工作目录无法解析: {}", e))?;
    Ok(canonical)
}

fn emit_event(app: &AppHandle, session_id: &str, kind: &str, payload: Option<Value>) {
    let _ = app.emit(&format!("agent-event-{}", session_id), serde_json::json!({"kind": kind, "payload": payload, "timestamp_ms": now_ms()}));
}

fn now_ms() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or_default()
}
