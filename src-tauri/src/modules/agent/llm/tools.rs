use std::collections::HashMap;
use serde_json::Value;
use async_openai::types::{ChatCompletionTool, ChatCompletionToolType, FunctionObject};

pub fn build_tools_combined(mcp_tools_map: &HashMap<String, Vec<Value>>) -> Vec<ChatCompletionTool> {
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
        tool_def("batch_file_ops", "批量执行文件操作（需要审批）", serde_json::json!({ "type": "object", "properties": { "actions": { "type": "array", "items": { "type": "object", "properties": { "action": { "type": "string" }, "path": { "type": "string" }, "from": { "type": "string" }, "to": { "type": "string" }, "content": { "type": "string" }, "overwrite": { "type": "boolean" } }, "required": ["action"] } } }, "required": ["actions"] })),
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
