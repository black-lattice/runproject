use super::tools::{
    batch_ops, default_auto_approve, delete_path, list_dir, mkdir, move_path, read_file,
    write_file, ApprovalState, PendingAction, ToolContext,
};
use super::types::{AgentMessage, AgentSessionRecord, AgentSettings};
use async_openai::config::OpenAIConfig;
use async_openai::types::{
    ChatCompletionMessageToolCall, ChatCompletionRequestAssistantMessage,
    ChatCompletionRequestAssistantMessageArgs, ChatCompletionRequestAssistantMessageContent,
    ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestSystemMessageContent,
    ChatCompletionRequestToolMessageArgs, ChatCompletionRequestToolMessageContent,
    ChatCompletionRequestUserMessageArgs, ChatCompletionRequestUserMessageContent,
    ChatCompletionTool, ChatCompletionToolChoiceOption, ChatCompletionToolType,
    CreateChatCompletionRequestArgs, CreateChatCompletionStreamResponse, FinishReason, FunctionCall,
    FunctionObject,
};
use async_openai::Client;
use futures::StreamExt;
use lazy_static::lazy_static;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

lazy_static! {
    static ref SESSIONS: Arc<Mutex<HashMap<String, AgentSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

struct AgentSession {
    workspace: PathBuf,
    session_file: PathBuf,
    history: Vec<AgentMessage>,
    approvals: Arc<ApprovalState>,
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
pub fn agent_start_session(app: AppHandle, session_id: String, workspace: String) -> Result<String, String> {
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
        },
    );

    emit_event(&app, &session_id, "session-start", None);
    Ok(session_id)
}

#[tauri::command]
pub fn agent_stop_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    sessions.remove(&session_id);
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
            timestamp_ms: now_ms(),
        };
        session.history.push(user_message);
        save_session_record(&app, &session_id, session)?;

        (session.workspace.clone(), session.approvals.clone(), history_snapshot)
    };

    let app_clone = app.clone();
    let app_for_error = app.clone();
    let session_id_clone = session_id.clone();
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

    if let Some(PendingAction {
        action_type,
        responder,
        ..
    }) = action
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
            if approved { "action-approved" } else { "action-rejected" },
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

    let client = build_client(&settings)?;
    let mut messages = build_messages(&history_snapshot, &content);

    for _ in 0..8 {
        let request = CreateChatCompletionRequestArgs::default()
            .model(settings.model.clone())
            .messages(messages.clone())
            .tools(build_tools())
            .tool_choice(ChatCompletionToolChoiceOption::Auto)
            .build()
            .map_err(|e| format!("构建请求失败: {}", e))?;

        let mut stream = client
            .chat()
            .create_stream(request)
            .await
            .map_err(|e| format!("创建流失败: {}", e))?;

        let mut assistant_text = String::new();
        let mut pending_tool_calls: HashMap<String, (String, String)> = HashMap::new();
        let mut finish_reason: Option<FinishReason> = None;

        while let Some(item) = stream.next().await {
            let response: CreateChatCompletionStreamResponse = item
                .map_err(|e| format!("流式响应失败: {}", e))?;

            for choice in response.choices {
                if let Some(reason) = choice.finish_reason {
                    finish_reason = Some(reason);
                }

                let delta = choice.delta;
                if let Some(content_delta) = delta.content {
                    assistant_text.push_str(&content_delta);
                    emit_event(
                        &app,
                        &session_id,
                        "delta",
                        Some(serde_json::json!({ "text": content_delta })),
                    );
                }

                if let Some(refusal) = delta.refusal {
                    emit_event(
                        &app,
                        &session_id,
                        "refusal",
                        Some(serde_json::json!({ "text": refusal })),
                    );
                }

                if let Some(tool_calls) = delta.tool_calls {
                    for tool_call in tool_calls {
                        let call_id = match tool_call.id {
                            Some(id) => id,
                            None => continue,
                        };
                        let function = match tool_call.function {
                            Some(function) => function,
                            None => continue,
                        };
                        let name = function.name.unwrap_or_default();
                        let args = function.arguments.unwrap_or_default();
                        let entry =
                            pending_tool_calls.entry(call_id).or_insert((name.clone(), String::new()));
                        if entry.0.is_empty() {
                            entry.0 = name;
                        }
                        entry.1.push_str(&args);
                    }
                }
            }
        }

        if !assistant_text.trim().is_empty() {
            messages.push(ChatCompletionRequestMessage::Assistant(
                ChatCompletionRequestAssistantMessageArgs::default()
                    .content(ChatCompletionRequestAssistantMessageContent::Text(
                        assistant_text.clone(),
                    ))
                    .build()
                    .map_err(|e| format!("构建助手消息失败: {}", e))?,
            ));
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

                let tool_result = call_tool(&ctx, &tool_name, &args_json).await?;
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
                        .content(ChatCompletionRequestToolMessageContent::Text(
                            tool_result.to_string(),
                        ))
                        .build()
                        .map_err(|e| format!("构建工具响应失败: {}", e))?,
                ));
            }

            continue;
        }

        if let Some(reason) = finish_reason {
            if reason != FinishReason::ToolCalls {
                break;
            }
        } else {
            break;
        }
    }

    let mut sessions = SESSIONS.lock().map_err(|_| "获取会话锁失败".to_string())?;
    if let Some(session) = sessions.get_mut(&session_id) {
        let assistant_message = AgentMessage {
            role: "assistant".to_string(),
            content: content_for_history(&messages),
            timestamp_ms: now_ms(),
        };
        session.history.push(assistant_message);
        save_session_record(&app, &session_id, session)?;
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

fn build_messages(history: &[AgentMessage], content: &str) -> Vec<ChatCompletionRequestMessage> {
    let mut messages = Vec::new();
    let system = ChatCompletionRequestSystemMessageArgs::default()
        .content(ChatCompletionRequestSystemMessageContent::Text(
            DEFAULT_SYSTEM_PROMPT.to_string(),
        ))
        .build()
        .unwrap_or(ChatCompletionRequestSystemMessage {
            content: ChatCompletionRequestSystemMessageContent::Text(
                DEFAULT_SYSTEM_PROMPT.to_string(),
            ),
            name: None,
        });
    messages.push(ChatCompletionRequestMessage::System(system));

    for message in history {
        if message.role == "assistant" {
            let assistant = ChatCompletionRequestAssistantMessageArgs::default()
                .content(ChatCompletionRequestAssistantMessageContent::Text(
                    message.content.clone(),
                ))
                .build()
                .unwrap();
            messages.push(ChatCompletionRequestMessage::Assistant(assistant));
        } else {
            let user = ChatCompletionRequestUserMessageArgs::default()
                .content(ChatCompletionRequestUserMessageContent::Text(
                    message.content.clone(),
                ))
                .build()
                .unwrap();
            messages.push(ChatCompletionRequestMessage::User(user));
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

fn build_tools() -> Vec<ChatCompletionTool> {
    vec![
        tool_def(
            "read_file",
            "读取工作目录内的文件内容",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "相对工作目录的文件路径" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "list_dir",
            "列出目录下的文件与子目录",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "相对工作目录的目录路径" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "write_file",
            "写入或创建文件（需要审批）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "overwrite": { "type": "boolean", "default": false }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "delete_path",
            "删除文件或目录（需要审批）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "mkdir",
            "创建目录（需要审批）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool_def(
            "move_path",
            "移动或重命名文件/目录（需要审批）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string" },
                    "to": { "type": "string" },
                    "overwrite": { "type": "boolean", "default": false }
                },
                "required": ["from", "to"]
            }),
        ),
        tool_def(
            "batch_file_ops",
            "批量执行文件操作（需要审批）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "action": { "type": "string" },
                                "path": { "type": "string" },
                                "from": { "type": "string" },
                                "to": { "type": "string" },
                                "content": { "type": "string" },
                                "overwrite": { "type": "boolean" }
                            },
                            "required": ["action"]
                        }
                    }
                },
                "required": ["actions"]
            }),
        ),
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

async fn call_tool(ctx: &ToolContext, name: &str, args_json: &str) -> Result<Value, String> {
    let args_value = parse_tool_args(args_json)?;

    match name {
        "read_file" => {
            let args: super::tools::ReadFileArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            read_file(ctx, args).await
        }
        "list_dir" => {
            let args: super::tools::ListDirArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            list_dir(ctx, args).await
        }
        "write_file" => {
            let args: super::tools::WriteFileArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            write_file(ctx, args).await
        }
        "delete_path" => {
            let args: super::tools::DeletePathArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            delete_path(ctx, args).await
        }
        "mkdir" => {
            let args: super::tools::MkdirArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            mkdir(ctx, args).await
        }
        "move_path" => {
            let args: super::tools::MovePathArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            move_path(ctx, args).await
        }
        "batch_file_ops" => {
            let args: super::tools::BatchArgs = serde_json::from_value(args_value).map_err(|_| "参数不合法".to_string())?;
            batch_ops(ctx, args).await
        }
        _ => Err("未知工具".to_string()),
    }
}

fn parse_tool_args(args_json: &str) -> Result<Value, String> {
    let trimmed = args_json.trim();
    if trimmed.is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    if let Ok(unescaped) = serde_json::from_str::<String>(trimmed) {
        if let Ok(value) = serde_json::from_str::<Value>(&unescaped) {
            return Ok(value);
        }
        if let Ok(value) = json5::from_str::<Value>(&unescaped) {
            return Ok(value);
        }
    }

    if let Ok(value) = json5::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    Err("工具参数解析失败".to_string())
}

fn content_for_history(messages: &[ChatCompletionRequestMessage]) -> String {
    let mut output = String::new();
    for message in messages.iter().rev() {
        if let ChatCompletionRequestMessage::Assistant(assistant) = message {
            if let Some(content) = assistant.content.as_ref() {
                if let Some(text) = extract_assistant_text(content) {
                    if !text.is_empty() {
                        output = text;
                        break;
                    }
                }
            }
        }
    }
    output
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
            if merged.is_empty() {
                None
            } else {
                Some(merged)
            }
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
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
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
        let content = serde_json::to_string_pretty(&record)
            .map_err(|e| format!("序列化会话失败: {}", e))?;
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
    let content = serde_json::to_string_pretty(&record)
        .map_err(|e| format!("序列化会话失败: {}", e))?;
    fs::write(&session.session_file, content).map_err(|e| format!("保存会话失败: {}", e))?;
    Ok(())
}

fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    Ok(app_data.join("agent_sessions"))
}

fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("工作目录不存在: {}", path.display()));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("工作目录无法解析: {}", e))?;
    Ok(canonical)
}

fn emit_event(app: &AppHandle, session_id: &str, kind: &str, payload: Option<Value>) {
    let _ = app.emit(
        &format!("agent-event-{}", session_id),
        serde_json::json!({
            "kind": kind,
            "payload": payload,
            "timestamp_ms": now_ms(),
        }),
    );
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}
