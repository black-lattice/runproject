use super::*;

#[test]
#[ignore]
fn real_natural_request_routes_two_projects_in_parallel() {
    struct Fixture {
        path: PathBuf,
        hub: Arc<Hub>,
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            self.hub.shutdown();
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
    let path = std::env::temp_dir().join(format!("runproject-parallel-{}", uuid::Uuid::new_v4()));
    let root = path.join("workspace");
    let manager = path.join("manager");
    std::fs::create_dir_all(&manager).unwrap();
    for name in ["ticket-service", "MouseGesture"] {
        std::fs::create_dir_all(root.join(name)).unwrap();
    }
    std::fs::write(root.join("ticket-service/package.json"),r#"{"name":"ticket-service","engines":{"node":">=20 <21"},"scripts":{"dev":"node app.js"}}"#).unwrap();
    std::fs::write(
        root.join("ticket-service/README.md"),
        "Use npm run dev. MARKER=TICKET_PARALLEL_TEST\n",
    )
    .unwrap();
    std::fs::write(root.join("MouseGesture/Package.swift"),"// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: \"MouseGesture\")\n").unwrap();
    std::fs::write(
        root.join("MouseGesture/README.md"),
        "A Swift gesture app. MARKER=GESTURE_PARALLEL_TEST\n",
    )
    .unwrap();
    let hub = Hub::create(path.join("test.db"), manager, Arc::new(|_| {})).unwrap();
    let fixture = Fixture {
        path,
        hub: hub.clone(),
    };
    let projects = crate::modules::project_scanner::scan_workspace(root.to_str().unwrap()).unwrap();
    assert_eq!(projects.len(), 2);
    let db = crate::storage::open_database_path(&hub.database).unwrap();
    crate::storage::write_projects(&db,&json!({"workspaces":[{"name":"fixture","path":root,"projects":projects}],"workspaceTags":{},"projectTags":{},"commandTags":{},"preferences":{}})).unwrap();
    drop(db);
    hub.jobs.send(Job::User("帮我看看 ticket-service 本地怎么启动，需要哪个版本的 Node，README 里的 MARKER 是什么。另外看看 MouseGesture 用什么语言，README 里的 MARKER 是什么。都只查，不修改文件、不安装依赖、不启动服务。".into(),None)).unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(180);
    let mut max_running = 0;
    loop {
        {
            let live = hub.live.lock().unwrap();
            if let Some(message) = live.store.messages.iter().find(|m| m.role == "system") {
                panic!("manager error: {}", message.text);
            }
            let running = live
                .store
                .tasks
                .iter()
                .filter(|t| t.status == "running" && t.turn_id.is_some())
                .count();
            if running > max_running {
                max_running = running;
                println!("Observed {running} worker turns running concurrently.");
            }
            if live.store.tasks.len() == 2
                && live.store.tasks.iter().all(|t| t.status == "completed")
                && live.store.messages.len() >= 3
                && !live.busy
            {
                let threads: HashSet<_> = live
                    .store
                    .tasks
                    .iter()
                    .filter_map(|t| t.thread_id.clone())
                    .collect();
                assert_eq!(threads.len(), 2);
                assert!(live
                    .store
                    .tasks
                    .iter()
                    .any(|t| t.project.name == "MouseGesture"
                        && t.result.contains("GESTURE_PARALLEL_TEST")));
                assert!(live
                    .store
                    .tasks
                    .iter()
                    .any(|t| t.project.name == "ticket-service"
                        && t.result.contains("TICKET_PARALLEL_TEST")));
                assert_eq!(max_running, 2, "worker turns did not overlap");
                println!("Both project workers completed; manager collected both results.");
                break;
            }
        }
        assert!(
            std::time::Instant::now() < deadline,
            "parallel request timed out"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    let threads = {
        let live = hub.live.lock().unwrap();
        live.store
            .tasks
            .iter()
            .filter_map(|t| t.thread_id.clone())
            .chain(live.store.manager_thread.clone())
            .collect::<Vec<_>>()
    };
    if let Some(conn) = hub.connection.lock().unwrap().as_ref() {
        for thread in threads {
            let _ = conn.request("thread/archive", json!({"threadId":thread}));
        }
    }
    drop(fixture);
}
