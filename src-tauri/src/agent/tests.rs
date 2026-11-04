use super::*;

#[test]
fn scheduler_reserves_slots_before_spawning_and_serializes_parent_projects() {
    let task = |id: &str, path: &str, status: &str| Task {
        id: id.into(),
        project: Project {
            name: id.into(),
            path: path.into(),
        },
        status: status.into(),
        pending: vec!["request".into()],
        ..Task::default()
    };
    let mut tasks = vec![
        task("active", "/work/app", "running"),
        task("child", "/work/app/sub", "queued"),
        task("same", "/work/app", "queued"),
        task("other", "/work/other", "queued"),
        task("third", "/work/third", "queued"),
        task("fourth", "/work/fourth", "queued"),
    ];
    assert_eq!(engine::reserve_tasks(&mut tasks), ["other", "third"]);
    assert!(engine::reserve_tasks(&mut tasks).is_empty());
    tasks[0].status = "completed".into();
    assert_eq!(engine::reserve_tasks(&mut tasks), ["child"]);
    assert_eq!(tasks[2].status, "queued");
}
#[test]
fn overlapping_project_roots_are_serialized() {
    assert!(overlaps("/work/app", "/work/app/src"));
    assert!(overlaps("/work/app/src", "/work/app"));
    assert!(!overlaps("/work/app", "/work/app-other"));
}
#[test]
fn restart_keeps_session_but_never_replays_pending_work() {
    let path = std::env::temp_dir().join(format!("agent-{}.db", uuid::Uuid::new_v4()));
    let db = crate::storage::open_database_path(&path).unwrap();
    db.execute_batch("CREATE TABLE agent_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)")
        .unwrap();
    let store = Store {
        tasks: vec![Task {
            status: "running".into(),
            thread_id: Some("saved-thread".into()),
            pending: vec!["do not replay".into()],
            ..Task::default()
        }],
        ..Store::default()
    };
    db.execute(
        "INSERT INTO agent_state VALUES(1,?1)",
        [serde_json::to_string(&store).unwrap()],
    )
    .unwrap();
    let restored = load_store(&path).unwrap();
    assert_eq!(restored.tasks[0].status, "interrupted");
    assert_eq!(restored.tasks[0].thread_id.as_deref(), Some("saved-thread"));
    assert!(restored.tasks[0].pending.is_empty());
    drop(db);
    let _ = std::fs::remove_file(path);
}

// Opt-in smoke test: uses the installed CLI and its existing authentication.
// All project inputs and writable files live in a disposable temporary folder.
#[test]
#[ignore]
fn real_codex_routes_reports_and_resumes_worker() {
    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    let fixture = Fixture(
        std::env::temp_dir().join(format!("runproject-agent-smoke-{}", uuid::Uuid::new_v4())),
    );
    let project = fixture.0.join("smoke-project");
    let manager = fixture.0.join("manager");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::create_dir_all(&manager).unwrap();
    std::fs::write(
        project.join("README.md"),
        "PROJECT_MARKER=RUNPROJECT_SMOKE_7429\n",
    )
    .unwrap();
    let hub = Hub::create(fixture.0.join("test.db"), manager, Arc::new(|_| {})).unwrap();
    struct Running(Arc<Hub>);
    impl Drop for Running {
        fn drop(&mut self) {
            self.0.shutdown();
        }
    }
    let _running = Running(hub.clone());
    hub.change(|live| {
        live.store.binary = std::env::var("RUNPROJECT_REAL_CODEX").unwrap_or_default();
        live.store.extra_projects.push(Project {
            name: "smoke-project".into(),
            path: std::fs::canonicalize(&project)
                .unwrap()
                .to_string_lossy()
                .into(),
        });
    });
    let wait = |predicate: &dyn Fn(&Live) -> bool| {
        let deadline = std::time::Instant::now() + Duration::from_secs(180);
        loop {
            {
                let live = hub.live.lock().unwrap();
                if live.store.messages.iter().any(|m| m.role == "system") {
                    panic!(
                        "integration error: {}",
                        live.store
                            .messages
                            .iter()
                            .filter(|m| m.role == "system")
                            .map(|m| m.text.as_str())
                            .collect::<Vec<_>>()
                            .join("; ")
                    );
                }
                if predicate(&live) {
                    break;
                }
            }
            if std::time::Instant::now() > deadline {
                hub.shutdown();
                panic!("Codex smoke test exceeded 180 seconds");
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    let catalog = hub.model_catalog().unwrap();
    assert!(!catalog["models"].as_array().unwrap().is_empty());
    println!("Read installed Codex model catalog and reasoning capabilities.");
    hub.jobs.send(Job::User("请派 Worker 到 smoke-project，只读 README.md，汇报 PROJECT_MARKER 的实际值，不修改任何文件或调用外部服务。".into(), None)).unwrap();
    wait(&|live| {
        live.store.tasks.len() == 1
            && live.store.tasks[0].status == "completed"
            && !live.busy
            && live.store.messages.len() >= 2
    });
    let task = hub.live.lock().unwrap().store.tasks[0].clone();
    assert!(task.result.contains("RUNPROJECT_SMOKE_7429"));
    println!("First request routed, worker read fixture, manager reported.");
    let before = hub.live.lock().unwrap().store.messages.len();
    hub.jobs.send(Job::User("继续交给选中的同一个 Worker：再次只读 README.md，回复实际标记值，并说明未修改文件。必须由 Worker 执行。".into(), Some(task.id.clone()))).unwrap();
    wait(&|live| {
        live.store.tasks.len() == 1
            && live.store.tasks[0].status == "completed"
            && live.store.tasks[0].updated_at > task.updated_at
            && !live.busy
            && live.store.messages.len() >= before + 2
    });
    let continued = hub.live.lock().unwrap().store.tasks[0].clone();
    assert_eq!(continued.thread_id, task.thread_id);
    assert!(continued.result.contains("RUNPROJECT_SMOKE_7429"));
    assert_eq!(
        std::fs::read_to_string(project.join("README.md")).unwrap(),
        "PROJECT_MARKER=RUNPROJECT_SMOKE_7429\n"
    );
    println!("Follow-up resumed the same worker; fixture unchanged.");
    if let Some(conn) = hub.connection.lock().unwrap().as_ref() {
        for thread in [
            hub.live.lock().unwrap().store.manager_thread.clone(),
            continued.thread_id,
        ]
        .into_iter()
        .flatten()
        {
            let _ = conn.request("thread/archive", json!({"threadId":thread}));
        }
    }
    hub.shutdown();
}
