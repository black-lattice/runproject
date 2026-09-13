mod tools;
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use serde::Serialize;
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager};
use tools::RunProjectMcp;

pub const PORT: u16 = 1421;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    running: bool,
    endpoint: String,
    token: String,
    error: Option<String>,
}
pub struct McpState(Mutex<McpStatus>);
#[derive(Clone)]
struct Access {
    token: String,
    authority: String,
}
async fn authorize(State(access): State<Access>, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let host = headers.get("host").and_then(|h| h.to_str().ok());
    let origin = headers.get("origin").and_then(|h| h.to_str().ok());
    let localhost = format!(
        "localhost:{}",
        access.authority.rsplit(':').next().unwrap_or("")
    );
    let valid_host = host == Some(access.authority.as_str()) || host == Some(localhost.as_str());
    if !valid_host
        || (headers.contains_key("origin")
            && origin != Some(format!("http://{}", host.unwrap_or("")).as_str()))
    {
        return (StatusCode::FORBIDDEN, "Forbidden origin or host").into_response();
    }
    if headers.get("authorization").and_then(|v| v.to_str().ok())
        != Some(format!("Bearer {}", access.token).as_str())
    {
        return (StatusCode::UNAUTHORIZED, "Bearer token required").into_response();
    }
    // Bound requests before the SDK collects their bodies.
    let (parts, body) = request.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, 1024 * 1024).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    next.run(Request::from_parts(parts, axum::body::Body::from(bytes)))
        .await
}
fn router(server: RunProjectMcp, token: String, port: u16) -> Router {
    let mut config = StreamableHttpServerConfig::default();
    config.legacy_session_mode = false;
    config.json_response = true;
    let service = StreamableHttpService::new(
        move || Ok(server.clone()),
        Arc::new(LocalSessionManager::default()),
        config,
    );
    Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(
            Access {
                token,
                authority: format!("127.0.0.1:{port}"),
            },
            authorize,
        ))
}
fn load_token(app: &AppHandle) -> Result<String, String> {
    use rusqlite::OptionalExtension;
    let path = crate::storage::database_path(app)?;
    let mut db = crate::storage::open_database_path(&path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let token: Option<String> = tx
        .query_row(
            "SELECT value FROM app_meta WHERE key='mcp_token'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let token = match token {
        Some(t) => t,
        None => {
            let t = format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            tx.execute(
                "INSERT INTO app_meta(key,value) VALUES('mcp_token',?1)",
                [&t],
            )
            .map_err(|e| e.to_string())?;
            t
        }
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(token)
}
pub fn start(app: &AppHandle) {
    let mut status = McpStatus {
        running: false,
        endpoint: format!("http://127.0.0.1:{PORT}/mcp"),
        token: String::new(),
        error: None,
    };
    let startup = (|| -> Result<_, String> {
        status.token = load_token(app)?;
        let db = crate::storage::database_path(app)?;
        let listener = TcpListener::bind(("127.0.0.1", PORT))
            .map_err(|e| format!("MCP 端口 {PORT} 无法启动：{e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        Ok((db, listener))
    })();
    match startup {
        Ok((db, listener)) => {
            status.running = true;
            let handle = app.clone();
            let mut server = RunProjectMcp::new(
                db,
                Arc::new(move |event| {
                    let _ = handle.emit(event, ());
                }),
            );
            server.script_events = crate::modules::script_runner::app_sink(app.clone());
            let service = router(server, status.token.clone(), PORT);
            app.manage(McpState(Mutex::new(status)));
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = match tokio::net::TcpListener::from_std(listener) {
                    Ok(listener) => axum::serve(listener, service).await,
                    Err(e) => Err(e),
                };
                if let Err(error) = result {
                    let state = handle.state::<McpState>();
                    if let Ok(mut status) = state.0.lock() {
                        status.running = false;
                        status.error = Some(error.to_string());
                    };
                }
            });
        }
        Err(error) => {
            status.error = Some(error);
            app.manage(McpState(Mutex::new(status)));
        }
    }
}
#[tauri::command]
pub fn get_mcp_status(state: tauri::State<'_, McpState>) -> Result<McpStatus, String> {
    state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    struct Server {
        url: String,
        root: std::path::PathBuf,
        task: tokio::task::JoinHandle<()>,
        client: reqwest::Client,
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.task.abort();
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    impl Server {
        async fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("runproject-mcp-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            let db = root.join("test.db");
            let connection = crate::storage::open_database_path(&db).unwrap();
            crate::storage::write_productivity(&connection,&json!({"tasks":[{"id":1,"title":"原始问题","done":false,"list":"工作","lists":["工作"],"categories":["工作"],"tags":[],"subtasks":[]}],"lists":[["工作","1"]]})).unwrap();
            drop(connection);
            let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
                .await
                .unwrap();
            let port = listener.local_addr().unwrap().port();
            let app = router(
                RunProjectMcp::new(db, Arc::new(|_| {})),
                "test-token".into(),
                port,
            );
            let task = tokio::spawn(async move {
                axum::serve(listener, app).await.unwrap();
            });
            Self {
                url: format!("http://127.0.0.1:{port}/mcp"),
                root,
                task,
                client: reqwest::Client::new(),
            }
        }
        async fn rpc(&self, method: &str, params: Value) -> Value {
            let response = self
                .client
                .post(&self.url)
                .bearer_auth("test-token")
                .header("Accept", "application/json, text/event-stream")
                .header("MCP-Protocol-Version", "2025-11-25")
                .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
                .send()
                .await
                .unwrap();
            let status = response.status();
            let body = response.text().await.unwrap();
            assert!(status.is_success(), "{status}: {body}");
            serde_json::from_str(&body).unwrap_or_else(|e| panic!("{e}: {body}"))
        }
        async fn call(&self, name: &str, args: Value) -> Value {
            let result = self
                .rpc("tools/call", json!({"name":name,"arguments":args}))
                .await;
            assert!(result.get("error").is_none(), "{result}");
            assert_ne!(result["result"]["isError"], true, "{result}");
            result["result"]["structuredContent"].clone()
        }
    }
    #[tokio::test]
    async fn http_protocol_auth_and_origin() {
        let s = Server::new().await;
        let response = s.client.post(&s.url).json(&json!({})).send().await.unwrap();
        assert_eq!(response.status(), 401);
        let response = s
            .client
            .post(&s.url)
            .bearer_auth("test-token")
            .header("Origin", "https://evil.example")
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
        let response = s
            .client
            .post(&s.url)
            .bearer_auth("test-token")
            .header("Host", "evil.example")
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
        let init=s.rpc("initialize",json!({"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"integration-test","version":"1"}})).await;
        assert_eq!(init["result"]["serverInfo"]["name"], "runproject");
        let tools = s.rpc("tools/list", json!({})).await;
        assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 20);
        assert!(tools["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["name"] == "get_tasks" && t["annotations"]["readOnlyHint"] == true));
        let invalid = s
            .rpc(
                "tools/call",
                json!({"name":"update_task","arguments":{"id":"1","changes":{"status":"invalid"}}}),
            )
            .await;
        assert!(
            invalid.get("error").is_some() || invalid["result"]["isError"] == true,
            "{invalid}"
        );
        let missing = s
            .rpc(
                "tools/call",
                json!({"name":"get_task","arguments":{"id":"missing"}}),
            )
            .await;
        assert_eq!(missing["result"]["isError"], true);
        let bad = s
            .rpc(
                "tools/call",
                json!({"name":"create_task","arguments":{"title":"bad","date":"2026-02-30"}}),
            )
            .await;
        assert_eq!(bad["result"]["isError"], true);
        let tasks = s.call("get_tasks", json!({})).await;
        assert_eq!(tasks["total"], 1);
    }
    #[tokio::test]
    async fn task_and_list_crud_persists_and_preserves_references() {
        let s = Server::new().await;
        s.call("create_list", json!({"name":"MCP 测试"})).await;
        let created=s.call("create_task",json!({"title":"待修复问题","detail":"复现步骤","list":"MCP 测试","date":"2026-09-13","priority":"高"})).await;
        let id = created["task"]["id"].as_str().unwrap();
        s.call(
            "update_task",
            json!({"id":id,"changes":{"status":"in-progress"}}),
        )
        .await;
        assert_eq!(
            s.call("get_tasks", json!({"status":"in-progress","query":"复现"}))
                .await["total"],
            1
        );
        s.call("update_task", json!({"id":id,"changes":{"status":"done"}}))
            .await;
        assert_eq!(
            s.call("get_task", json!({"id":id})).await["task"]["done"],
            true
        );
        s.call("rename_list", json!({"name":"工作","new_name":"新名称"}))
            .await;
        let task = s.call("get_task", json!({"id":"1"})).await;
        for field in ["lists", "categories"] {
            assert_eq!(task["task"][field], json!(["新名称"]));
        }
        s.call("delete_list", json!({"name":"MCP 测试"})).await;
        assert_eq!(
            s.call("get_task", json!({"id":id})).await["task"]["list"],
            "收件箱"
        );
        s.call("delete_task", json!({"id":id})).await;
        assert_eq!(s.call("get_tasks", json!({})).await["total"], 1);
        s.call("restore_task", json!({"id":id})).await;
        assert_eq!(s.call("get_tasks", json!({})).await["total"], 2);
        let db = crate::storage::open_database_path(&s.root.join("test.db")).unwrap();
        assert_eq!(
            crate::storage::read_productivity(&db).unwrap()["tasks"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
    #[tokio::test]
    async fn http_section_updates_and_list_renames_preserve_membership_metadata() {
        let s = Server::new().await;
        {
            let db = crate::storage::open_database_path(&s.root.join("test.db")).unwrap();
            crate::storage::write_productivity(&db, &json!({
                "lists":[["工作","1",{"sections":["空分组"],"color":"blue"},"extra"],["个人","2"]],
                "tasks":[
                    {"id":1,"title":"共享分组任务","list":"工作","lists":["工作","个人"],"categories":["工作","个人"],"section":"准备","sections":{"工作":"工作分组","历史清单":"保留历史"},"done":false},
                    {"id":2,"title":"其他清单独立任务","list":"个人","section":"个人分组","done":false}
                ]
            })).unwrap();
        }
        let untouched = s.call("get_task", json!({"id":"2"})).await;
        let assigned = s
            .call(
                "update_task",
                json!({"id":"1","changes":{"section":"  执行  "}}),
            )
            .await;
        assert_eq!(assigned["task"]["section"], "执行");
        assert_eq!(assigned["task"]["sections"]["工作"], "执行");
        assert_eq!(assigned["task"]["sections"]["个人"], "执行");
        assert_eq!(assigned["task"]["sections"]["历史清单"], "保留历史");
        assert_eq!(s.call("get_task", json!({"id":"2"})).await, untouched);

        for invalid in [
            " 已完成 ".to_string(),
            "已放弃".to_string(),
            "未分组".to_string(),
            "a".repeat(41),
            "🌕".repeat(21),
        ] {
            for name in ["create_task", "update_task"] {
                let fields = json!({"title":"不应写入","section":invalid});
                let args = if name == "create_task" {
                    fields
                } else {
                    json!({"id":"1","changes":fields})
                };
                let rejected = s
                    .rpc("tools/call", json!({"name":name,"arguments":args}))
                    .await;
                assert_eq!(rejected["result"]["isError"], true, "{rejected}");
                assert!(
                    rejected["result"]["content"].to_string().contains("分组"),
                    "{rejected}"
                );
                assert_eq!(s.call("get_task", json!({"id":"1"})).await, assigned);
                assert_eq!(s.call("get_tasks", json!({})).await["total"], 2);
            }
        }
        let emoji_group = "🌕".repeat(20);
        let emoji = s
            .call(
                "update_task",
                json!({"id":"1","changes":{"section":emoji_group}}),
            )
            .await;
        assert_eq!(emoji["task"]["sections"]["工作"], emoji_group);
        let cleared = s
            .call("update_task", json!({"id":"1","changes":{"section":" "}}))
            .await;
        assert_eq!(cleared["task"]["section"], "");
        assert_eq!(cleared["task"]["sections"]["工作"], "");
        assert_eq!(cleared["task"]["sections"]["个人"], "");

        s.call("rename_list", json!({"name":"工作","new_name":"新工作"}))
            .await;
        let renamed = s.call("get_task", json!({"id":"1"})).await;
        assert_eq!(renamed["task"]["lists"], json!(["新工作", "个人"]));
        assert!(renamed["task"]["sections"].get("工作").is_none());
        assert_eq!(renamed["task"]["sections"]["新工作"], "");
        {
            let db = crate::storage::open_database_path(&s.root.join("test.db")).unwrap();
            let saved = crate::storage::read_productivity(&db).unwrap();
            assert_eq!(
                saved["lists"][0],
                json!(["新工作","1",{"sections":["空分组"],"color":"blue"},"extra"])
            );
        }
        for (name, args) in [
            (
                "rename_list",
                json!({"name":"工作","new_name":"失效重命名"}),
            ),
            ("delete_list", json!({"name":"工作"})),
            (
                "update_task",
                json!({"id":"1","changes":{"list":"工作","section":"不应写入"}}),
            ),
        ] {
            let rejected = s
                .rpc("tools/call", json!({"name":name,"arguments":args}))
                .await;
            assert_eq!(rejected["result"]["isError"], true, "{rejected}");
            assert_eq!(s.call("get_task", json!({"id":"1"})).await, renamed);
        }
        s.call("delete_list", json!({"name":"新工作"})).await;
        let removed = s.call("get_task", json!({"id":"1"})).await;
        assert_eq!(removed["task"]["list"], "个人");
        assert_eq!(removed["task"]["lists"], json!(["个人"]));
        assert_eq!(removed["task"]["categories"], json!(["个人"]));
        assert!(removed["task"]["sections"].get("新工作").is_none());
        assert_eq!(removed["task"]["sections"]["个人"], "");
        assert_eq!(s.call("get_task", json!({"id":"2"})).await, untouched);
        let stale = s
            .rpc(
                "tools/call",
                json!({"name":"delete_list","arguments":{"name":"新工作"}}),
            )
            .await;
        assert_eq!(stale["result"]["isError"], true);
        assert_eq!(s.call("get_tasks", json!({})).await["total"], 2);
    }
    #[tokio::test]
    async fn http_recurring_task_completion_preserves_fields_and_has_one_successor() {
        let s = Server::new().await;
        // Future fixed dates avoid dependence on the machine's local day and timezone.
        let created = s
            .call(
                "create_task",
                json!({
                    "title":"每日巡检集成测试",
                    "detail":"保留巡检说明",
                    "list":"工作",
                    "date":"2050-03-01",
                    "time":"09:30",
                    "priority":"高",
                    "tags":["例行","集成测试"],
                    "section":"巡检",
                    "repeat":"每天",
                    "reminder":"2050-03-01T09:15",
                    "important":true,
                    "urgent":false,
                    "pinned":true
                }),
            )
            .await;
        let id = created["task"]["id"].as_str().unwrap();
        assert_eq!(created["task"]["repeat"], "每天");
        assert_eq!(created["task"]["reminder"], "2050-03-01T09:15");
        assert_eq!(created["task"]["important"], true);
        assert_eq!(created["task"]["urgent"], false);
        assert_eq!(created["task"]["pinned"], true);
        let create_activity = created["task"]["activity"].as_array().unwrap();
        assert_eq!(create_activity.len(), 1);
        assert_eq!(create_activity[0]["message"], "通过 MCP 创建任务");
        assert!(create_activity[0]["at"].as_u64().unwrap() > 0);
        assert!(create_activity[0]["id"].as_str().is_some());

        let updated = s
            .call(
                "update_task",
                json!({"id":id,"changes":{
                    "status":"in-progress","important":false,"urgent":true,"pinned":false
                }}),
            )
            .await;
        assert_eq!(updated["task"]["status"], "in-progress");
        assert_eq!(updated["task"]["done"], false);
        assert_eq!(updated["task"]["important"], false);
        assert_eq!(updated["task"]["urgent"], true);
        assert_eq!(updated["task"]["pinned"], false);
        let update_activity = updated["task"]["activity"].as_array().unwrap();
        assert_eq!(update_activity.len(), 2);
        assert_eq!(update_activity[1]["message"], "通过 MCP 更新任务");
        assert_ne!(update_activity[0]["id"], update_activity[1]["id"]);

        let completed = s
            .call("update_task", json!({"id":id,"changes":{"status":"done"}}))
            .await;
        assert_eq!(completed["task"]["done"], true);
        assert_eq!(completed["task"]["status"], "done");
        let successor_id = completed["task"]["recurrenceNextId"]
            .as_str()
            .expect("completion response must expose the persisted successor ID");
        assert_ne!(successor_id, id);
        let matches = s
            .call("get_tasks", json!({"query":"每日巡检集成测试"}))
            .await;
        assert_eq!(matches["total"], 2, "{matches}");
        let children: Vec<_> = matches["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|task| task["id"] != id)
            .collect();
        assert_eq!(children.len(), 1);
        let child = children[0];
        assert_eq!(child["id"], successor_id);
        assert_eq!(child["date"], "2050-03-02");
        assert_eq!(child["reminder"], "2050-03-02T09:15");
        assert_eq!(child["done"], false);
        assert_eq!(child["status"], "pending");
        assert_eq!(child["recurrenceRootId"], id);
        assert_eq!(child["recurrenceIndex"], 1);
        for field in [
            "title",
            "detail",
            "list",
            "lists",
            "categories",
            "time",
            "priority",
            "tags",
            "section",
            "repeat",
            "important",
            "urgent",
            "pinned",
        ] {
            assert_eq!(child[field], updated["task"][field], "lost field {field}");
        }
        assert_eq!(
            s.call("get_task", json!({"id":id})).await["task"],
            completed["task"],
            "mutation response must match the saved task including recurrence and activity"
        );
        assert_eq!(
            completed["task"]["activity"]
                .as_array()
                .unwrap()
                .last()
                .unwrap()["message"],
            "通过 MCP 更新任务"
        );

        for status in ["pending", "done", "done"] {
            let result = s
                .call("update_task", json!({"id":id,"changes":{"status":status}}))
                .await;
            assert_eq!(result["task"]["recurrenceNextId"], successor_id);
            let matches = s
                .call("get_tasks", json!({"query":"每日巡检集成测试"}))
                .await;
            assert_eq!(matches["total"], 2, "{status}: {matches}");
        }
        let pending = s
            .call(
                "get_tasks",
                json!({"query":"每日巡检集成测试","status":"pending"}),
            )
            .await;
        assert_eq!(pending["total"], 1);
        assert_eq!(pending["tasks"][0]["id"], successor_id);
    }
    #[tokio::test]
    async fn http_rejects_invalid_recurrence_and_unicode_reminders_without_partial_writes() {
        let s = Server::new().await;
        let created = s
            .call(
                "create_task",
                json!({"title":"校验保护任务","date":"2050-03-01","repeat":"每周","reminder":"2050-03-01T12:00"}),
            )
            .await;
        let id = created["task"]["id"].as_str().unwrap();
        for (field, invalid) in [
            ("repeat", "每隔三天"),
            ("repeat", "DAILY"),
            ("reminder", "2050-03-01T🌕:"),
            ("reminder", "2050-03-01T12:🌕"),
            ("reminder", "2050-03-01T24:00"),
            ("reminder", "2050-03-01T12:60"),
            ("reminder", "2050-02-30T12:00"),
            ("reminder", "2050-03-01T12:00T00:00"),
        ] {
            for operation in ["create_task", "update_task"] {
                let mut fields = json!({"title":"不应保存的修改"});
                fields[field] = json!(invalid);
                let arguments = if operation == "create_task" {
                    fields
                } else {
                    json!({"id":id,"changes":fields})
                };
                let rejected = s
                    .rpc(
                        "tools/call",
                        json!({"name":operation,"arguments":arguments}),
                    )
                    .await;
                assert!(rejected.get("error").is_none(), "{rejected}");
                assert_eq!(rejected["result"]["isError"], true, "{rejected}");
                let content = rejected["result"]["content"].to_string();
                assert!(
                    content.contains(&format!("{field} 必须")),
                    "expected a normal validation error, not a caught panic: {rejected}"
                );
                assert_eq!(
                    s.call("get_task", json!({"id":id})).await["task"],
                    created["task"],
                    "rejected {operation} must not save title changes or activity"
                );
                assert_eq!(s.call("get_tasks", json!({})).await["total"], 2);
            }
        }
        let cleared = s
            .call(
                "update_task",
                json!({"id":id,"changes":{"repeat":"","reminder":""}}),
            )
            .await;
        assert_eq!(cleared["task"]["repeat"], "");
        assert_eq!(cleared["task"]["reminder"], "");
        assert_eq!(cleared["task"]["activity"].as_array().unwrap().len(), 2);
    }
    #[tokio::test]
    async fn project_crud_does_not_delete_files() {
        let s = Server::new().await;
        let path = s.root.join("workspace");
        std::fs::create_dir(&path).unwrap();
        std::fs::write(
            path.join("package.json"),
            r#"{"name":"sample","scripts":{"dev":"vite"}}"#,
        )
        .unwrap();
        let created = s.call("add_workspace", json!({"path":path})).await;
        let canonical = created["workspace"]["path"].as_str().unwrap();
        assert_eq!(
            s.call("get_workspaces", json!({})).await["workspaces"][0]["project_count"],
            1
        );
        let projects = s
            .call("get_projects", json!({"workspace_path":canonical}))
            .await;
        assert_eq!(
            projects["projects"][0]["project"]["commands"][0]["name"],
            "dev"
        );
        s.call(
            "set_project_tags",
            json!({"target":"project","path":canonical,"tags":["测试"]}),
        )
        .await;
        std::fs::write(
            path.join("package.json"),
            r#"{"name":"sample","scripts":{"build":"vite build"}}"#,
        )
        .unwrap();
        s.call("refresh_workspace", json!({"path":canonical})).await;
        let projects = s.call("get_projects", json!({})).await;
        assert_eq!(
            projects["projects"][0]["project"]["commands"][0]["name"],
            "build"
        );
        assert_eq!(projects["projects"][0]["tags"], json!(["测试"]));
        s.call("remove_workspace", json!({"path":canonical})).await;
        assert!(path.join("package.json").exists());
        assert_eq!(
            s.call("get_workspaces", json!({})).await["workspaces"],
            json!([])
        );
    }
    #[tokio::test]
    async fn concurrent_clients_do_not_lose_tasks() {
        let s = Server::new().await;
        let (a, b) = tokio::join!(
            s.call("create_task", json!({"title":"A"})),
            s.call("create_task", json!({"title":"B"}))
        );
        assert_ne!(a["task"]["id"], b["task"]["id"]);
        assert_eq!(s.call("get_tasks", json!({})).await["total"], 3);
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn scripts_start_duplicate_logs_stop_and_validation() {
        let s = Server::new().await;
        let project = s.root.join("scripts-project");
        std::fs::create_dir(&project).unwrap();
        let project = std::fs::canonicalize(project).unwrap();
        std::fs::write(project.join("package.json"),json!({"name":"mcp-script-test","scripts":{"dev":"node -e \"console.log('MCP_READY');setInterval(()=>{},1000)\""}}).to_string()).unwrap();
        let args = json!({"project_path":project,"script":"dev"});
        let invalid = s
            .rpc(
                "tools/call",
                json!({"name":"start_project_script","arguments":args}),
            )
            .await;
        assert_eq!(invalid["result"]["isError"], true);
        s.call("add_workspace", json!({"path":project})).await;
        let invalid=s.rpc("tools/call",json!({"name":"start_project_script","arguments":{"project_path":project,"script":"missing"}})).await;
        assert_eq!(invalid["result"]["isError"], true);
        let (first, second) = tokio::join!(
            s.call("start_project_script", args.clone()),
            s.call("start_project_script", args)
        );
        assert_eq!(first["id"], second["id"]);
        let id = first["id"].clone();
        let mut output = Value::Null;
        for _ in 0..100 {
            output = s.call("get_script_run", json!({"run_id":id})).await;
            if output["output"].as_str().unwrap().contains("MCP_READY") {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        let stopped = s.call("stop_project_script", json!({"run_id":id})).await;
        assert!(
            output["output"].as_str().unwrap().contains("MCP_READY"),
            "{output}"
        );
        assert_eq!(stopped["status"], "stopped", "{stopped}");
        assert_eq!(
            s.call("stop_project_script", json!({"run_id":id})).await["status"],
            "stopped"
        );
        assert!(s
            .call(
                "get_script_runs",
                json!({"project_path":project,"running_only":true})
            )
            .await["runs"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(
            s.call("get_script_run", json!({"run_id":id})).await["output"]
                .as_str()
                .unwrap()
                .contains("MCP_READY")
        );
        s.call("remove_workspace", json!({"path":project})).await;
    }
}
