use super::*;
fn launch(runner: &ScriptRunner, command: &str) -> ScriptRun {
    runner
        .launch(
            json!({"name":"test","path":std::env::temp_dir()}),
            json!({"name":"test"}),
            command.into(),
            Arc::new(|_, _| {}),
        )
        .unwrap()
}
fn finished(runner: &ScriptRunner, id: &str) -> ScriptRun {
    for _ in 0..100 {
        let run = runner.get(id).unwrap();
        if !active(&run.status) {
            return run;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("script did not exit");
}
#[test]
fn captures_real_exit_codes_and_keeps_bounded_logs() {
    let runner = ScriptRunner::default();
    let run = launch(&runner, "printf 'hello script'; exit 7");
    let end = finished(&runner, &run.id);
    assert_eq!(end.status, "failed");
    assert_eq!(end.exit_code, Some(7));
    assert!(runner.logs(&run.id, 16000).unwrap()["output"]
        .as_str()
        .unwrap()
        .contains("hello script"));
    assert_eq!(runner.stop(&run.id, false).unwrap().exit_code, Some(7));
    let run = launch(
        &runner,
        "head -c 2200000 /dev/zero | tr '\\0' x; printf 'FINAL'; exit 0",
    );
    assert_eq!(finished(&runner, &run.id).status, "succeeded");
    let logs = runner.logs(&run.id, 100).unwrap();
    assert_eq!(logs["truncated"], true);
    assert_eq!(logs["retainedBytes"], MAX_LOG);
    assert!(logs["output"].as_str().unwrap().ends_with("FINAL"));
    assert!(runner.logs(&run.id, 0).is_err());
}
#[test]
fn stop_terminates_child_process_group_and_shutdown_cleans_up() {
    let runner = ScriptRunner::default();
    let file = std::env::temp_dir().join(format!("runproject-child-{}", uuid::Uuid::new_v4()));
    let command = format!(
        "trap '' INT; sleep 60 & echo $! > {}; wait",
        quote(file.to_str().unwrap())
    );
    let run = launch(&runner, &command);
    for _ in 0..100 {
        if file.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let pid: i32 = std::fs::read_to_string(&file)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert_eq!(unsafe { libc::kill(pid, 0) }, 0);
    assert_eq!(runner.stop(&run.id, false).unwrap().status, "stopped");
    let mut gone = false;
    for _ in 0..100 {
        let output = std::process::Command::new("ps")
            .args(["-o", "stat=", "-p", &pid.to_string()])
            .output()
            .unwrap();
        let state = String::from_utf8_lossy(&output.stdout);
        if !output.status.success() || state.trim().is_empty() || state.trim().starts_with('Z') {
            gone = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(gone, "child is still executing");
    std::fs::remove_file(file).unwrap();
    let run = launch(&runner, "sleep 60");
    runner.shutdown();
    assert_eq!(runner.get(&run.id).unwrap().status, "stopped");
    assert!(runner.stop("missing", true).is_err());
}
#[test]
fn script_names_are_shell_quoted() {
    let command = build_command(
        &json!({"packageManager":"npm"}),
        "test'; echo injected; '",
        None,
    )
    .unwrap();
    assert!(command.contains("'test'\\''; echo injected; '\\'''"));
    assert!(build_command(&json!({}), "--help", None).is_err());
    assert!(build_command(&json!({"packageManager":"npm;echo bad"}), "dev", None).is_err());
}
