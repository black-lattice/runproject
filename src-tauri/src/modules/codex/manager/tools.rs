use crate::modules::codex::types::McpTool;
use serde_json::Value;
use std::path::Path;

pub fn is_initialize_result(result: &Value) -> bool {
    result.get("capabilities").is_some()
        || result.get("serverInfo").is_some()
        || result.get("protocolVersion").is_some()
}

pub fn is_tools_list_result(result: &Value) -> bool {
    result
        .get("tools")
        .and_then(|value| value.as_array())
        .is_some()
}

pub fn extract_tools(result: &Value) -> Vec<McpTool> {
    let tools_value = result
        .get("tools")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    tools_value
        .into_iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_string();
            let description = tool
                .get("description")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let input_schema = tool
                .get("inputSchema")
                .or_else(|| tool.get("input_schema"))
                .cloned();
            Some(McpTool {
                name,
                description,
                input_schema,
            })
        })
        .collect()
}

pub fn select_tool_name(tools: &[McpTool]) -> Option<String> {
    let priorities = ["codex", "chat", "assistant"];
    for keyword in priorities {
        if let Some(tool) = tools
            .iter()
            .find(|tool| tool.name.to_lowercase().contains(keyword))
        {
            return Some(tool.name.clone());
        }
    }
    tools.first().map(|tool| tool.name.clone())
}

pub fn build_tool_arguments(
    tool: Option<&McpTool>,
    content: &str,
    files: Option<Vec<String>>,
    workspace: &Path,
    model: Option<String>,
) -> Value {
    let mut args = serde_json::Map::new();
    let schema = tool
        .and_then(|tool| tool.input_schema.as_ref())
        .and_then(|schema| schema.get("properties"))
        .and_then(|props| props.as_object());

    let content_key = pick_property(
        schema,
        &["content", "prompt", "input", "message", "query", "text"],
    )
    .unwrap_or_else(|| "content".to_string());
    args.insert(content_key, Value::String(content.to_string()));

    if let Some(files) = files {
        if let Some(files_key) =
            pick_property(schema, &["files", "paths", "file_paths", "filePaths"])
        {
            args.insert(
                files_key,
                Value::Array(files.into_iter().map(Value::String).collect()),
            );
        }
    }

    if let Some(workspace_key) = pick_property(schema, &["workspace", "cwd", "working_dir", "root"])
    {
        args.insert(
            workspace_key,
            Value::String(workspace.to_string_lossy().to_string()),
        );
    }

    if let Some(model) = model {
        if let Some(model_key) = pick_property(schema, &["model", "model_name", "provider_model"]) {
            args.insert(model_key, Value::String(model));
        }
    }

    Value::Object(args)
}

fn pick_property(
    schema: Option<&serde_json::Map<String, Value>>,
    candidates: &[&str],
) -> Option<String> {
    let schema = schema?;
    candidates
        .iter()
        .find(|key| schema.contains_key(**key))
        .map(|key| key.to_string())
}
