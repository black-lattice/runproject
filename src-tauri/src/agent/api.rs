//! OpenAI-compatible Chat Completions adapter for the coordinator only.
use super::*;
use std::io::Read;

pub(super) fn endpoint(base: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base.trim())
        .map_err(|_| "请输入完整的 API 地址，例如 https://host/v1")?;
    let local = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("远程 API 请使用 HTTPS；本机服务可使用 HTTP。".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("API 地址不能包含账号、密码、查询参数或片段；密钥请填在 API Key 中。".into());
    }
    let path = url.path().trim_end_matches('/');
    let path = if path.ends_with("/chat/completions") {
        path.to_owned()
    } else {
        format!("{path}/chat/completions")
    };
    url.set_path(&path);
    Ok(url.to_string())
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法创建 API 连接".into())
}

fn response_json(mut response: reqwest::blocking::Response) -> Result<Value, String> {
    if !response.status().is_success() {
        // Provider error bodies may echo credentials or the full request.
        return Err(format!(
            "API 返回 HTTP {}，请检查地址、密钥、模型和输出格式。",
            response.status().as_u16()
        ));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut response)
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "API 响应读取失败".to_owned())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("API 响应过大".into());
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "API 未返回有效 JSON，请确认是 OpenAI 兼容接口。".into())
}

pub(super) fn complete(
    config: &ManagerConfig,
    key: Option<&str>,
    history: &[Value],
    prompt: &str,
) -> Result<String, String> {
    let mut messages = vec![
        json!({"role":"system","content":format!("{}\n输出 JSON，不要输出 Markdown。JSON Schema：{}", MANAGER_INSTRUCTIONS, plan_schema())}),
    ];
    messages.extend(history.iter().cloned());
    messages.push(json!({"role":"user","content":prompt}));
    let mut body = json!({"model":config.api_model,"messages":messages,"stream":false});
    if !config.api_effort.is_empty() {
        body["reasoning_effort"] = json!(config.api_effort);
    }
    match config.api_format.as_str() {
        "json_object" => body["response_format"] = json!({"type":"json_object"}),
        "json_schema" => {
            body["response_format"] = json!({"type":"json_schema","json_schema":{"name":"project_manager_plan","strict":true,"schema":plan_schema()}})
        }
        _ => (),
    }
    let mut request = client()?.post(endpoint(&config.api_base)?).json(&body);
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        request = request.bearer_auth(key);
    }
    let response = response_json(
        request
            .send()
            .map_err(|_| "API 连接失败或超时，请检查网络和地址。")?,
    )?;
    let choice = &response["choices"][0];
    if matches!(
        choice["finish_reason"].as_str(),
        Some("length" | "content_filter" | "tool_calls")
    ) {
        return Err("模型回复被截断、过滤或返回了工具调用，本轮未派发任务。".into());
    }
    choice["message"]["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
        .ok_or("API 没有返回文本回复，请检查模型是否支持 Chat Completions。".into())
}

pub(super) fn models(config: &ManagerConfig, key: Option<&str>) -> Result<Vec<String>, String> {
    let endpoint = endpoint(&config.api_base)?;
    let url = format!("{}/models", endpoint.trim_end_matches("/chat/completions"));
    let mut request = client()?.get(url);
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        request = request.bearer_auth(key);
    }
    let data = response_json(
        request
            .send()
            .map_err(|_| "读取 API 模型列表失败；可手动填写模型 ID。")?,
    )?;
    let ids: Vec<_> = data["data"]
        .as_array()
        .ok_or("接口未提供模型列表；请手动填写模型 ID。")?
        .iter()
        .filter_map(|m| m["id"].as_str().map(str::to_owned))
        .collect();
    Ok(ids)
}

pub(super) fn parse_plan(text: &str) -> Result<Plan, String> {
    let text = text.trim();
    let text = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```"))
        .and_then(|s| s.trim().strip_suffix("```"))
        .unwrap_or(text)
        .trim();
    serde_json::from_str(text).map_err(|_| {
        "总管未返回有效的任务计划，本轮未派发任务；请调整模型或结构化输出格式。".into()
    })
}

impl Hub {
    pub(super) fn manager_reply(self: &Arc<Self>, prompt: String) -> Result<Plan, String> {
        let config = self.live.lock().unwrap().store.manager_config.clone();
        if config.backend == "api" {
            let (key, history) = (
                self.api_key(&config)?,
                self.live.lock().unwrap().store.api_history.clone(),
            );
            let answer = complete(&config, key.as_deref(), &history, &prompt)?;
            let plan = parse_plan(&answer)?;
            self.change(|live| {
                let history = &mut live.store.api_history;
                history.push(json!({"role":"user","content":prompt}));
                history.push(json!({"role":"assistant","content":answer}));
                // Always drop complete user/assistant pairs, never a partial turn.
                while history.len() > 20
                    || (history.len() > 2
                        && history
                            .iter()
                            .map(|m| m["content"].as_str().unwrap_or("").len())
                            .sum::<usize>()
                            > 120000)
                {
                    history.drain(..2);
                }
            });
            Ok(plan)
        } else {
            let conn = self.connect()?;
            let thread = self.live.lock().unwrap().store.manager_thread.clone();
            let thread = self.thread(&conn, thread, &self.manager_dir.to_string_lossy(), true)?;
            self.change(|live| live.store.manager_thread = Some(thread.clone()));
            parse_plan(&self.turn(&conn, &thread, prompt, true, None)?)
        }
    }
}
