use super::*;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};

struct HttpFixture {
    address: std::net::SocketAddr,
    requests: mpsc::Receiver<Value>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl HttpFixture {
    fn new(reply: impl Fn(&str, &Value) -> (u16, Value) + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let (tx, requests) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            for stream in listener.incoming() {
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                let mut stream = stream.unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut first = String::new();
                reader.read_line(&mut first).unwrap();
                let mut len = 0;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" || line.is_empty() {
                        break;
                    }
                    if let Some((name, value)) = line.split_once(':') {
                        if name.eq_ignore_ascii_case("content-length") {
                            len = value.trim().parse().unwrap();
                        }
                    }
                }
                let mut bytes = vec![0; len];
                reader.read_exact(&mut bytes).unwrap();
                let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
                let _ = tx.send(body.clone());
                let (status, value) = reply(&first, &body);
                let body = value.to_string();
                write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
        });
        Self {
            address,
            requests,
            stop,
            thread: Some(thread),
        }
    }
    fn base(&self) -> String {
        format!("http://{}/v1", self.address)
    }
}
impl Drop for HttpFixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.address);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct HubFixture {
    hub: Arc<Hub>,
    directory: PathBuf,
}
impl HubFixture {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("runproject-api-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let hub = Hub::create(
            directory.join("test.db"),
            directory.clone(),
            Arc::new(|_| {}),
        )
        .unwrap();
        Self { hub, directory }
    }
}
impl Drop for HubFixture {
    fn drop(&mut self) {
        self.hub.shutdown();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn config(server: &HttpFixture) -> ManagerConfig {
    ManagerConfig {
        backend: "api".into(),
        api_base: server.base(),
        api_model: "fixture-model".into(),
        ..ManagerConfig::default()
    }
}
fn completion(content: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":content.to_string()}}]})
}

#[test]
fn api_manager_preserves_conversation_without_starting_codex_and_saves_settings() {
    let server = HttpFixture::new(|_, _| {
        (
            200,
            completion(json!({"reply":"fixture reply","actions":[]})),
        )
    });
    let fixture = HubFixture::new();
    let hub = &fixture.hub;
    hub.save_manager_config(config(&server), None, false)
        .unwrap();
    hub.coordinate(Job::User("first request".into(), None))
        .unwrap();
    hub.coordinate(Job::User("follow-up request".into(), None))
        .unwrap();
    let first = server.requests.recv().unwrap();
    let second = server.requests.recv().unwrap();
    assert_eq!(first["model"], "fixture-model");
    assert!(first.get("reasoning_effort").is_none());
    assert_eq!(first["response_format"]["type"], "json_object");
    assert_eq!(second["messages"].as_array().unwrap().len(), 4);
    assert!(second["messages"][1]["content"]
        .as_str()
        .unwrap()
        .contains("first request"));
    assert!(hub.connection.lock().unwrap().is_none());
    let mut next = config(&server);
    next.api_effort = "high".into();
    next.api_model = "other-fixture-model".into();
    hub.save_manager_config(next, None, false).unwrap();
    hub.coordinate(Job::User("new model".into(), None)).unwrap();
    let third = server.requests.recv().unwrap();
    assert_eq!(third["reasoning_effort"], "high");
    assert_eq!(third["model"], "other-fixture-model");
    assert_eq!(third["messages"].as_array().unwrap().len(), 2);
    assert!(third["messages"][1]["content"]
        .as_str()
        .unwrap()
        .contains("fixture reply")); // recent public history survives switching models
    let restored = load_store(&hub.database).unwrap();
    assert_eq!(restored.manager_config.api_model, "other-fixture-model");
    assert_eq!(restored.messages.len(), 3);
}

#[test]
fn invalid_api_plan_cannot_start_a_worker_or_escape_project_registry() {
    let server = HttpFixture::new(|_, _| {
        (
            200,
            completion(
                json!({"reply":"do work","actions":[{"kind":"start","projectPath":"/not-a-registered-project","taskId":"","title":"bad route","prompt":"do work"}]}),
            ),
        )
    });
    let fixture = HubFixture::new();
    let hub = &fixture.hub;
    hub.save_manager_config(config(&server), None, false)
        .unwrap();
    assert!(hub
        .coordinate(Job::User("request".into(), None))
        .unwrap_err()
        .contains("未登记"));
    assert!(hub.live.lock().unwrap().store.tasks.is_empty());
    assert!(hub.connection.lock().unwrap().is_none());
    assert!(api::parse_plan("not JSON").is_err());
    assert!(api::parse_plan(r#"{"reply":"x","actions":[],"unexpected":"command"}"#).is_err());
}

#[test]
fn api_failure_does_not_expose_provider_body_or_silently_downgrade_parameters() {
    let server = HttpFixture::new(|_, _| {
        (
            401,
            json!({"error":{"message":"TEST_SECRET_DO_NOT_DISPLAY"}}),
        )
    });
    let mut cfg = config(&server);
    cfg.api_format = "prompt".into();
    cfg.api_effort = "low".into();
    let error = api::complete(&cfg, Some("TEST_SECRET_DO_NOT_DISPLAY"), &[], "test").unwrap_err();
    assert!(error.contains("401"));
    assert!(!error.contains("TEST_SECRET"));
    let request = server.requests.recv().unwrap();
    assert_eq!(request["reasoning_effort"], "low");
    assert!(request.get("response_format").is_none());
}

#[test]
fn endpoint_normalization_and_key_binding_reject_accidental_credential_transfers() {
    assert_eq!(
        api::endpoint("https://example.com/v1/").unwrap(),
        "https://example.com/v1/chat/completions"
    );
    assert_eq!(
        api::endpoint("https://example.com/v1/chat/completions").unwrap(),
        "https://example.com/v1/chat/completions"
    );
    for base in [
        "http://remote.example/v1",
        "https://user:password@example.com/v1",
        "https://example.com/v1?api_key=secret",
        "file:///tmp/api",
    ] {
        assert!(api::endpoint(base).is_err());
    }
    let fixture = HubFixture::new();
    fixture.hub.change(|live| {
        live.store.manager_credential = Some(CredentialRef {
            endpoint: "https://old.example/v1/chat/completions".into(),
            id: "not-a-real-key".into(),
        })
    });
    let cfg = ManagerConfig {
        backend: "api".into(),
        api_base: "https://new.example/v1".into(),
        api_model: "model".into(),
        ..ManagerConfig::default()
    };
    assert!(fixture.hub.api_key(&cfg).unwrap().is_none()); // must not read an old destination's key
    let json = fixture.hub.snapshot().unwrap();
    assert!(json.get("managerCredential").is_none());
    assert!(json.get("apiHistory").is_none());
}

#[test]
fn changing_manager_config_preserves_tasks_and_rejects_mid_turn_changes() {
    let fixture = HubFixture::new();
    let hub = &fixture.hub;
    hub.change(|live| {
        live.store.manager_thread = Some("old-manager-thread".into());
        live.store.tasks.push(Task {
            id: "existing-task".into(),
            ..Task::default()
        });
    });
    let cfg = ManagerConfig {
        codex_model: "fixture-model".into(),
        codex_effort: "low".into(),
        ..ManagerConfig::default()
    };
    {
        let _gate = hub.manager_gate.lock().unwrap();
        assert!(hub.save_manager_config(cfg.clone(), None, false).is_err());
    }
    hub.save_manager_config(cfg.clone(), None, false).unwrap();
    let saved = load_store(&hub.database).unwrap();
    assert_eq!(saved.manager_config, cfg);
    assert!(saved.manager_thread.is_none());
    assert_eq!(saved.tasks[0].id, "existing-task");
}

#[cfg(unix)]
#[test]
fn codex_model_overrides_apply_only_to_manager_threads_and_turns() {
    let fixture = HubFixture::new();
    let (binary, log) = fake_codex(&fixture);
    fixture.hub.change(|live| {
        live.store.binary = binary.to_string_lossy().into();
        live.store.manager_config = ManagerConfig {
            codex_model: "fixture-manager".into(),
            codex_effort: "low".into(),
            ..ManagerConfig::default()
        };
    });
    let conn = fixture.hub.connect().unwrap();
    for manager in [true, false] {
        let thread = fixture
            .hub
            .thread(&conn, None, fixture.directory.to_str().unwrap(), manager)
            .unwrap();
        assert_eq!(
            fixture
                .hub
                .turn(&conn, &thread, "test".into(), manager, None)
                .unwrap(),
            "done"
        );
    }
    let requests: Vec<Value> = std::fs::read_to_string(log)
        .unwrap()
        .lines()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect();
    let starts: Vec<_> = requests
        .iter()
        .filter(|r| r["method"] == "thread/start")
        .collect();
    let turns: Vec<_> = requests
        .iter()
        .filter(|r| r["method"] == "turn/start")
        .collect();
    assert_eq!(starts[0]["params"]["model"], "fixture-manager");
    assert_eq!(
        starts[0]["params"]["config"]["model_reasoning_effort"],
        "low"
    );
    assert_eq!(turns[0]["params"]["model"], "fixture-manager");
    assert_eq!(turns[0]["params"]["effort"], "low");
    assert!(starts[1]["params"].get("model").is_none());
    assert!(turns[1]["params"].get("model").is_none());
    assert!(turns[1]["params"].get("effort").is_none());
}

#[cfg(unix)]
fn fake_codex(fixture: &HubFixture) -> (PathBuf, PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let log = fixture.directory.join("rpc.jsonl");
    let binary = fixture.directory.join("fake-codex");
    let script = r#"#!/usr/bin/env python3
import json,sys
log=open(LOG_PATH,'a',buffering=1)
count=0
def send(value): print(json.dumps(value),flush=True)
for line in sys.stdin:
    r=json.loads(line); log.write(json.dumps(r)+'\n')
    method=r.get('method'); p=r.get('params',{})
    if 'id' not in r: continue
    if method=='thread/start':
        count+=1;send({'id':r['id'],'result':{'thread':{'id':'thread-'+str(count)}}})
    elif method=='turn/start':
        turn='turn-'+str(count)
        send({'id':r['id'],'result':{'turn':{'id':turn}}})
        send({'method':'item/completed','params':{'threadId':p['threadId'],'turnId':turn,'item':{'type':'agentMessage','text':'done'}}})
        send({'method':'turn/completed','params':{'threadId':p['threadId'],'turn':{'id':turn,'status':'completed'}}})
    else: send({'id':r['id'],'result':{}})
"#.replace("LOG_PATH", &serde_json::to_string(&log).unwrap());
    std::fs::write(&binary, script).unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
    (binary, log)
}

#[cfg(unix)]
#[test]
fn api_manager_dispatches_codex_worker_and_collects_result() {
    let fixture = HubFixture::new();
    let (binary, _) = fake_codex(&fixture);
    let project = std::fs::canonicalize(&fixture.directory)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let target = project.clone();
    let server = HttpFixture::new(move |_, body| {
        let input: Value = serde_json::from_str(
            body["messages"].as_array().unwrap().last().unwrap()["content"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        let plan = if input["input"]["kind"] == "worker_result" {
            assert_eq!(input["input"]["task"]["result"], "done");
            json!({"reply":"worker result collected","actions":[]})
        } else {
            json!({"reply":"worker dispatched","actions":[{"kind":"start","taskId":"","projectPath":target,"title":"fixture work","prompt":"fixture request"}]})
        };
        (200, completion(plan))
    });
    fixture.hub.change(|live| {
        live.store.binary = binary.to_string_lossy().into();
        live.store.extra_projects.push(Project {
            name: "fixture".into(),
            path: project,
        });
    });
    fixture
        .hub
        .save_manager_config(config(&server), None, false)
        .unwrap();
    fixture
        .hub
        .coordinate(Job::User("dispatch worker".into(), None))
        .unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        {
            let live = fixture.hub.live.lock().unwrap();
            if live
                .store
                .messages
                .iter()
                .any(|m| m.text == "worker result collected")
            {
                assert_eq!(live.store.tasks[0].status, "completed");
                assert!(live.store.tasks[0].thread_id.is_some());
                assert!(live.store.manager_thread.is_none());
                break;
            }
        }
        assert!(
            std::time::Instant::now() < deadline,
            "API -> Codex worker -> API report timed out"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}
