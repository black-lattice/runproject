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
