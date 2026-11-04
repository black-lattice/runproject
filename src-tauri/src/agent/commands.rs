use super::*;

#[tauri::command]
pub async fn agent_models(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
) -> Result<Value, String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || hub.model_catalog())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_save_manager(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    config: ManagerConfig,
    api_key: Option<String>,
    clear_api_key: bool,
) -> Result<(), String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        hub.save_manager_config(config, api_key, clear_api_key)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_api_models(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    config: ManagerConfig,
    api_key: Option<String>,
    clear_api_key: bool,
) -> Result<Vec<String>, String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let key = if let Some(key) = api_key.filter(|k| !k.is_empty()) {
            Some(key)
        } else if clear_api_key {
            None
        } else {
            hub.api_key(&config)?
        };
        api::models(&config, key.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_test_api(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    config: ManagerConfig,
    api_key: Option<String>,
    clear_api_key: bool,
) -> Result<String, String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let config = config.validate()?;
        if config.backend != "api" {
            return Err("请选择 API 后端后测试".into());
        }
        let key = if let Some(key) = api_key.filter(|k| !k.is_empty()) {
            Some(key)
        } else if clear_api_key {
            None
        } else {
            hub.api_key(&config)?
        };
        let answer = api::complete(
            &config,
            key.as_deref(),
            &[],
            "连接测试：只回复 JSON {\"reply\":\"连接成功\",\"actions\":[]}，不要执行任何工作。",
        )?;
        let plan = api::parse_plan(&answer)?;
        if !plan.actions.is_empty() {
            return Err("模型在连接测试中返回了执行操作，不符合总管协议；未执行任何操作。".into());
        }
        Ok("连接成功，模型可以返回总管所需的任务计划。".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_snapshot(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
) -> Result<Value, String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || hub.snapshot())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    binary: String,
) -> Result<Value, String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        // Configuration changes never strand an in-flight worker on another server.
        let current = hub.live.lock().unwrap().store.binary.clone();
        if current != binary {
            let busy = {
                let live = hub.live.lock().unwrap();
                live.busy || live.store.tasks.iter().any(|t| active(&t.status))
            };
            if busy {
                return Err("请先等待总管与 Worker 完成，再切换 Codex 路径".into());
            }
            if let Some(conn) = hub.connection.lock().unwrap().take() {
                conn.shutdown();
            }
            hub.change(|live| live.store.binary = binary);
        }
        hub.connect()?;
        hub.snapshot()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_send(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    text: String,
    task_id: Option<String>,
) -> Result<(), String> {
    if text.trim().is_empty() || text.chars().count() > 20000 {
        return Err("请输入 1–20000 字的需求".into());
    }
    let hub = state.hub(app)?;
    hub.message("user", text.trim());
    hub.jobs
        .send(Job::User(text, task_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_stop(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    task_id: String,
) -> Result<(), String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = hub.connect()?;
        hub.stop(&task_id, &conn)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_approve(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    request_id: Value,
    accept: bool,
) -> Result<(), String> {
    let hub = state.hub(app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let request = hub
            .live
            .lock()
            .unwrap()
            .approvals
            .iter()
            .find(|r| r["id"] == request_id)
            .cloned()
            .ok_or("请求已结束，请刷新状态")?;
        let conn = hub.connect()?;
        conn.write(
            &json!({"id":request_id,"result":{"decision":if accept {"accept"} else {"decline"}}}),
        )?;
        hub.change(|live| {
            live.approvals.retain(|a| a["id"] != request_id);
            if let Some(t) = live
                .store
                .tasks
                .iter_mut()
                .find(|t| t.thread_id.as_deref() == request["params"]["threadId"].as_str())
            {
                t.status = "running".into();
            }
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_add_project(
    app: AppHandle,
    state: tauri::State<'_, AgentService>,
    path: String,
) -> Result<(), String> {
    let hub = state.hub(app)?;
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("请选择项目目录".into());
    }
    let project = Project {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        path: path.to_string_lossy().into(),
    };
    hub.change(|live| {
        if !live
            .store
            .extra_projects
            .iter()
            .any(|p| p.path == project.path)
        {
            live.store.extra_projects.push(project);
        }
    });
    Ok(())
}
