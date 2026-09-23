use super::*;
use std::path::PathBuf;
use std::sync::Barrier;

struct Fixture {
    root: PathBuf,
    database: PathBuf,
    project: PathBuf,
    runner: ScriptRunner,
}
impl Fixture {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("runproject-restart-{}", uuid::Uuid::new_v4()));
        let project = root.join("project");
        std::fs::create_dir_all(&project).unwrap();
        let project = std::fs::canonicalize(project).unwrap();
        let database = root.join("state.db");
        let connection = storage::open_database_path(&database).unwrap();
        storage::write_projects(
            &connection,
            &json!({
                "workspaces": [{"path":root, "projects":[{
                    "name":"restart-fixture", "path":project, "packageManager":"npm"
                }]}], "preferences":{}
            }),
        )
        .unwrap();
        let fixture = Self {
            root,
            database,
            project,
            runner: ScriptRunner::default(),
        };
        fixture.script("printf 'ORIGINAL_LOG\\n'; sleep 60");
        fixture
    }
    fn script(&self, script: &str) {
        std::fs::write(
            self.project.join("package.json"),
            json!({
                "name":"restart-fixture", "version":"1.0.0", "scripts":{"dev":script}
            })
            .to_string(),
        )
        .unwrap();
    }
    fn start(&self) -> ScriptRun {
        self.runner
            .start(
                &self.database,
                self.project.to_str().unwrap(),
                "dev",
                Arc::new(|_, _| {}),
            )
            .unwrap()
    }
    fn wait_log(&self, id: &str, text: &str) {
        for _ in 0..200 {
            if self.runner.logs(id, 16000).unwrap()["output"]
                .as_str()
                .unwrap()
                .contains(text)
            {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("missing fixture output: {text}");
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.runner.shutdown();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn duplicate_restarts_share_one_successor_and_preserve_old_logs() {
    let fixture = Fixture::new();
    let old = fixture.start();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    let barrier = Barrier::new(4);
    let results = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..4)
            .map(|_| {
                scope.spawn(|| {
                    barrier.wait();
                    fixture
                        .runner
                        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
                        .unwrap()
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_ne!(old.id, results[0].id);
    assert!(results.iter().all(|run| run.id == results[0].id));
    let ended = fixture.runner.get(&old.id).unwrap();
    assert_eq!(ended.status, "stopped");
    assert!(!ended.restart_pending);
    assert!(ended.ended_at.unwrap() <= results[0].started_at);
    assert_eq!(fixture.runner.list(None, true).unwrap().len(), 1);
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    // A start from another entry point reuses the restarted process.
    assert_eq!(fixture.start().id, results[0].id);
}

#[test]
fn restart_validates_current_script_before_stopping() {
    let fixture = Fixture::new();
    let old = fixture.start();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    std::fs::write(fixture.project.join("package.json"), "{\"scripts\":{}}").unwrap();
    let error = fixture
        .runner
        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
        .unwrap_err();
    assert!(error.contains("不存在该脚本"));
    assert_eq!(fixture.runner.get(&old.id).unwrap().status, "running");
    assert_eq!(fixture.runner.list(None, false).unwrap().len(), 1);
}

#[test]
fn restarted_script_uses_latest_content_and_reports_real_failure() {
    let fixture = Fixture::new();
    let old = fixture.start();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    fixture.script("printf 'UPDATED_FAILURE\\n'; exit 7");
    let new = fixture
        .runner
        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
        .unwrap();
    fixture.wait_log(&new.id, "UPDATED_FAILURE");
    for _ in 0..100 {
        if !active(&fixture.runner.get(&new.id).unwrap().status) {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let failed = fixture.runner.get(&new.id).unwrap();
    assert_eq!(failed.status, "failed");
    assert_eq!(failed.exit_code, Some(7));
    assert_eq!(
        fixture
            .runner
            .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
            .unwrap()
            .id,
        new.id
    );
    fixture.script("printf 'RECOVERED\\n'; sleep 60");
    let recovered = fixture
        .runner
        .restart(&fixture.database, &new.id, Arc::new(|_, _| {}))
        .unwrap();
    fixture.wait_log(&recovered.id, "RECOVERED");
    assert_eq!(fixture.runner.list(None, true).unwrap().len(), 1);
}

#[test]
fn still_stopping_never_starts_a_second_process() {
    let fixture = Fixture::new();
    let old = fixture.start();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    // Model an earlier stop request whose exit has not yet been confirmed.
    fixture
        .runner
        .entry(&old.id)
        .unwrap()
        .lock()
        .unwrap()
        .info
        .status = "stopping".into();
    let result = fixture
        .runner
        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}));
    assert!(result.unwrap_err().contains("尚未退出"));
    let pending = fixture.runner.get(&old.id).unwrap();
    assert_eq!(pending.status, "stopping");
    assert!(!pending.restart_pending);
    assert!(pending.error.is_some());
    assert_eq!(fixture.runner.list(None, false).unwrap().len(), 1);
}

#[test]
fn unrelated_project_operations_do_not_share_a_lock() {
    let fixture = Fixture::new();
    let held = fixture
        .runner
        .operation_lock("/another/project", "dev")
        .unwrap();
    let _guard = held.lock().unwrap();
    let run = fixture.start();
    fixture.wait_log(&run.id, "ORIGINAL_LOG");
    assert_eq!(run.status, "running");
}

#[test]
fn start_during_restart_waits_for_the_same_successor() {
    let fixture = Fixture::new();
    let (tx, rx) = std::sync::mpsc::channel();
    let old = fixture
        .runner
        .start(
            &fixture.database,
            fixture.project.to_str().unwrap(),
            "dev",
            Arc::new(move |event, payload| {
                if event == "script-run-updated" && payload["restartPending"] == true {
                    let _ = tx.send(());
                }
            }),
        )
        .unwrap();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    std::thread::scope(|scope| {
        let restart = scope.spawn(|| {
            fixture
                .runner
                .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
                .unwrap()
        });
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let concurrent_start = fixture.start();
        assert_eq!(concurrent_start.id, restart.join().unwrap().id);
        assert_eq!(fixture.runner.list(None, true).unwrap().len(), 1);
    });
}

#[test]
fn launch_failure_after_stop_is_visible_and_retry_can_recover() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let fixture = Fixture::new();
    let project = fixture.project.clone();
    let removed = AtomicBool::new(false);
    // Simulate the directory becoming unavailable between preflight and launch.
    let old = fixture
        .runner
        .start(
            &fixture.database,
            fixture.project.to_str().unwrap(),
            "dev",
            Arc::new(move |event, payload| {
                if event == "script-run-updated"
                    && payload["restartPending"] == true
                    && !removed.swap(true, Ordering::SeqCst)
                {
                    std::fs::remove_dir_all(&project).unwrap();
                }
            }),
        )
        .unwrap();
    fixture.wait_log(&old.id, "ORIGINAL_LOG");
    assert!(fixture
        .runner
        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
        .is_err());
    let failed = fixture.runner.get(&old.id).unwrap();
    assert_eq!(failed.status, "stopped");
    assert!(!failed.restart_pending);
    assert!(failed.error.is_some());
    assert!(failed.restarted_as.is_none());
    assert!(fixture.runner.list(None, true).unwrap().is_empty());
    std::fs::create_dir_all(&fixture.project).unwrap();
    fixture.script("printf 'RECOVERED_AFTER_LAUNCH_FAILURE\\n'; sleep 60");
    let recovered = fixture
        .runner
        .restart(&fixture.database, &old.id, Arc::new(|_, _| {}))
        .unwrap();
    fixture.wait_log(&recovered.id, "RECOVERED_AFTER_LAUNCH_FAILURE");
    assert_eq!(
        fixture.runner.get(&old.id).unwrap().restarted_as,
        Some(recovered.id)
    );
}

#[test]
fn usage_counts_only_new_launches_and_persists_across_connections() {
    let fixture = Fixture::new();
    let first = fixture.start();
    assert_eq!(fixture.start().id, first.id);
    let count = || {
        let db = storage::open_database_path(&fixture.database).unwrap();
        db.query_row("SELECT COUNT(*) FROM command_launches", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap()
    };
    assert_eq!(count(), 1);
    let failure = fixture.runner.start(
        &fixture.database,
        fixture.project.to_str().unwrap(),
        "missing-script",
        Arc::new(|_, _| {}),
    );
    assert!(failure.is_err());
    assert_eq!(count(), 1);
    let successor = fixture
        .runner
        .restart(&fixture.database, &first.id, Arc::new(|_, _| {}))
        .unwrap();
    assert_ne!(successor.id, first.id);
    assert_eq!(count(), 2);
    fixture
        .runner
        .restart(&fixture.database, &first.id, Arc::new(|_, _| {}))
        .unwrap();
    assert_eq!(count(), 2);
}
