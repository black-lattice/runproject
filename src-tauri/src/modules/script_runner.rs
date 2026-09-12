//! Managed project scripts shared by MCP, the project page and the tray.
use super::terminal::session::{TerminalConfig, TerminalSession};
use crate::{modules::nvm_manager, storage};
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Read,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

pub type EventSink = Arc<dyn Fn(&str, Value) + Send + Sync>;
const MAX_LOG: usize = 2 * 1024 * 1024;
const MAX_HISTORY: usize = 50;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRun {
    pub id: String,
    pub run_id: u64,
    pub project: Value,
    pub command: Value,
    pub status: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub exit_code: Option<u32>,
    pub error: Option<String>,
}
struct Record {
    info: ScriptRun,
    session: Option<TerminalSession>,
    buffer: Arc<Mutex<Vec<u8>>>,
    dropped_bytes: u64,
}
type Entry = Arc<Mutex<Record>>;
#[derive(Default)]
pub struct ScriptRunner {
    runs: Mutex<HashMap<String, Entry>>,
    starts: Mutex<()>,
}
lazy_static! {
    pub static ref RUNNER: ScriptRunner = ScriptRunner::default();
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn active(status: &str) -> bool {
    matches!(status, "running" | "stopping")
}
pub fn app_sink(app: AppHandle) -> EventSink {
    Arc::new(move |name, value| {
        let _ = app.emit(name, value);
    })
}
fn quote(value: &str) -> String {
    #[cfg(windows)]
    {
        format!("'{}'", value.replace('\'', "''"))
    }
    #[cfg(not(windows))]
    {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}
fn build_command(project: &Value, script: &str, version: Option<&str>) -> Result<String, String> {
    let manager = project["packageManager"].as_str().unwrap_or("npm");
    if !["npm", "pnpm", "yarn"].contains(&manager) {
        return Err("不支持的包管理器".into());
    }
    if script.starts_with('-') || script.contains(['\0', '\n', '\r']) {
        return Err("脚本名称无效".into());
    }
    let command = format!("{} run {}", manager, quote(script));
    let mut command = if let Some(version) = version.filter(|v| !v.is_empty() && *v != "system") {
        // The existing Node manager accepts a shell fragment for its version.
        nvm_manager::wrap_command_with_node(&quote(version), &command)?
    } else {
        command
    };
    #[cfg(windows)]
    {
        command.push_str("; exit $LASTEXITCODE");
    }
    #[cfg(not(windows))]
    {
        command.push_str("\nexit $?");
    }
    Ok(command)
}
impl ScriptRunner {
    pub fn start(
        &self,
        database: &Path,
        project_path: &str,
        script: &str,
        emit: EventSink,
    ) -> Result<ScriptRun, String> {
        let _serial = self.starts.lock().map_err(|e| e.to_string())?;
        let path =
            std::fs::canonicalize(project_path).map_err(|e| format!("项目路径不可用: {e}"))?;
        let db = storage::open_database_path(database)?;
        let data = storage::read_projects(&db)?["data"].clone();
        let mut project = None;
        for w in data["workspaces"].as_array().into_iter().flatten() {
            for p in w["projects"].as_array().into_iter().flatten() {
                if p["path"]
                    .as_str()
                    .is_some_and(|p| std::fs::canonicalize(p).is_ok_and(|p| p == path))
                {
                    project = Some(p.clone());
                    break;
                }
            }
        }
        let mut project =
            project.ok_or("项目未添加到工作区，请先 add_workspace 或 refresh_workspace")?;
        // Validate against today's package.json, not a possibly stale script cache.
        let package: Value = serde_json::from_str(
            &std::fs::read_to_string(path.join("package.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let script_body = package["scripts"][script]
            .as_str()
            .ok_or("package.json 中不存在该脚本，请刷新项目后重试")?;
        let command = json!({"name":script,"script":script_body});
        let canonical = path.to_string_lossy().to_string();
        for existing in self.list(Some(&canonical), true)? {
            if existing.command["name"] == script {
                return Ok(existing);
            }
        }
        let preference_key = format!(
            "{}_{}",
            project["name"].as_str().unwrap_or(""),
            project["path"].as_str().unwrap_or("")
        );
        let version = data["preferences"][&preference_key]["nodeVersion"]
            .as_str()
            .or(project["nodeVersion"].as_str());
        let command_line = build_command(&project, script, version)?;
        project["path"] = json!(canonical);
        self.launch(project, command, command_line, emit)
    }
    fn launch(
        &self,
        project: Value,
        command: Value,
        command_line: String,
        emit: EventSink,
    ) -> Result<ScriptRun, String> {
        {
            let mut runs = self.runs.lock().map_err(|e| e.to_string())?;
            if runs
                .values()
                .filter(|r| active(&r.lock().unwrap().info.status))
                .count()
                >= 16
            {
                return Err("同时运行的脚本已达 16 个，请先停止部分脚本".into());
            }
            let mut finished: Vec<_> = runs
                .iter()
                .filter_map(|(id, r)| {
                    let r = r.lock().unwrap();
                    r.info.ended_at.map(|time| (id.clone(), time))
                })
                .collect();
            finished.sort_by_key(|(_, time)| *time);
            for (id, _) in finished
                .into_iter()
                .take(runs.len().saturating_sub(MAX_HISTORY - 1))
            {
                runs.remove(&id);
            }
        }
        let id = format!("script-{}", uuid::Uuid::new_v4());
        let run_id = now();
        let session = TerminalSession::for_script(
            TerminalConfig {
                cwd: project["path"].as_str().ok_or("项目路径无效")?.into(),
                cols: 120,
                rows: 30,
            },
            &command_line,
        )?;
        let reader_result = session
            .master
            .lock()
            .map_err(|e| e.to_string())?
            .try_clone_reader()
            .map_err(|e| e.to_string());
        let reader = match reader_result {
            Ok(reader) => reader,
            Err(error) => {
                let _ = session.terminate();
                if let Ok(mut child) = session.child.lock() {
                    if let Some(child) = child.as_mut() {
                        let _ = child.wait();
                    }
                }
                return Err(error);
            }
        };
        let info = ScriptRun {
            id: id.clone(),
            run_id,
            project,
            command,
            status: "running".into(),
            started_at: run_id,
            ended_at: None,
            exit_code: None,
            error: None,
        };
        let entry = Arc::new(Mutex::new(Record {
            info: info.clone(),
            buffer: session.buffer.clone(),
            session: Some(session.clone()),
            dropped_bytes: 0,
        }));
        self.runs
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), entry.clone());
        emit(
            "script-run-started",
            json!({"sessionId":id,"runId":run_id,"project":info.project,"command":info.command,"managed":true,"title":format!("{}-{}",info.project["name"].as_str().unwrap_or(""),info.command["name"].as_str().unwrap_or(""))}),
        );
        let read_entry = entry.clone();
        let read_emit = emit.clone();
        let read_id = id.clone();
        let reader_thread = std::thread::spawn(move || {
            let mut reader = reader;
            let mut chunk = [0u8; 8192];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        {
                            let mut record = read_entry.lock().unwrap();
                            let buffer = record.buffer.clone();
                            let mut log = buffer.lock().unwrap();
                            let overflow = (log.len() + n).saturating_sub(MAX_LOG);
                            if overflow > 0 {
                                log.drain(..overflow);
                                record.dropped_bytes += overflow as u64;
                            }
                            log.extend_from_slice(&chunk[..n]);
                        }
                        read_emit(
                            &format!("terminal-output-{read_id}"),
                            json!(general_purpose::STANDARD.encode(&chunk[..n])),
                        );
                    }
                }
            }
        });
        std::thread::spawn(move || {
            loop {
                let result = {
                    let mut child = session.child.lock().unwrap();
                    match child.as_mut() {
                        Some(c) => c.try_wait(),
                        None => break,
                    }
                };
                match result {
                    Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                    result => {
                        // Ordinary scripts close stdout on exit. Never wait forever on
                        // explicitly detached descendants holding the PTY open.
                        for _ in 0..20 {
                            if reader_thread.is_finished() {
                                break;
                            }
                            std::thread::sleep(Duration::from_millis(10));
                        }
                        let info = {
                            let mut record = entry.lock().unwrap();
                            match result {
                                Ok(Some(exit)) => {
                                    record.info.exit_code = Some(exit.exit_code());
                                    record.info.status = if record.info.status == "stopping" {
                                        "stopped"
                                    } else if exit.success() {
                                        "succeeded"
                                    } else {
                                        "failed"
                                    }
                                    .into();
                                }
                                Err(e) => {
                                    record.info.status = "failed".into();
                                    record.info.error = Some(e.to_string());
                                }
                                _ => unreachable!(),
                            }
                            record.info.ended_at = Some(now());
                            record.session = None;
                            record.info.clone()
                        };
                        emit(
                            "command-finished",
                            json!({"sessionId":id,"runId":run_id,"exitCode":info.exit_code,"status":info.status}),
                        );
                        emit("script-run-updated", json!(info));
                        emit(&format!("terminal-closed-{id}"), Value::Null);
                        break;
                    }
                }
            }
        });
        Ok(info)
    }
    fn entry(&self, id: &str) -> Result<Entry, String> {
        self.runs
            .lock()
            .map_err(|e| e.to_string())?
            .get(id)
            .cloned()
            .ok_or_else(|| format!("执行记录不存在: {id}（记录仅保留在本次应用运行期间）"))
    }
    pub fn get(&self, id: &str) -> Result<ScriptRun, String> {
        Ok(self
            .entry(id)?
            .lock()
            .map_err(|e| e.to_string())?
            .info
            .clone())
    }
    pub fn list(
        &self,
        project: Option<&str>,
        running_only: bool,
    ) -> Result<Vec<ScriptRun>, String> {
        let runs = self.runs.lock().map_err(|e| e.to_string())?;
        let mut result: Vec<_> = runs
            .values()
            .map(|r| r.lock().unwrap().info.clone())
            .filter(|r| {
                (!running_only || active(&r.status))
                    && project.is_none_or(|p| r.project["path"] == p)
            })
            .collect();
        result.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        Ok(result)
    }
    pub fn stop(&self, id: &str, force: bool) -> Result<ScriptRun, String> {
        let entry = self.entry(id)?;
        let session = {
            let record = entry.lock().unwrap();
            if !active(&record.info.status) || (record.info.status == "stopping" && !force) {
                return Ok(record.info.clone());
            }
            record.session.clone().ok_or("进程已退出")?
        };
        let signalled = (|| -> Result<(), String> {
            // Keep the root unreaped while signalling its process group so its
            // PID cannot be reused. The monitor also takes this child lock.
            let mut guard = session.child.lock().map_err(|e| e.to_string())?;
            let child = guard.as_mut().ok_or("进程句柄不存在")?;
            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                entry.lock().unwrap().info.status = "stopping".into();
                let pid = child.process_id().ok_or("无法读取脚本进程 ID")?;
                #[cfg(unix)]
                {
                    let signal = |sig| -> Result<(), String> {
                        let result = unsafe { libc::kill(-(pid as i32), sig) };
                        if result != 0 {
                            let e = std::io::Error::last_os_error();
                            if e.raw_os_error() != Some(libc::ESRCH) {
                                return Err(format!("signal {sig}, group {pid}: {e}"));
                            }
                        }
                        Ok(())
                    };
                    if !force {
                        signal(libc::SIGINT)?;
                        std::thread::sleep(Duration::from_millis(1200));
                    }
                    if let Err(error) = signal(libc::SIGKILL) {
                        // Darwin reports EPERM when the entire group is already
                        // dead (its leader is still unreaped). Confirm exit before
                        // accepting this; do not signal this PID again after wait.
                        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                            return Err(error);
                        }
                    }
                }
                #[cfg(windows)]
                {
                    let result = std::process::Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .output()
                        .map_err(|e| e.to_string())?;
                    if !result.status.success() {
                        return Err(String::from_utf8_lossy(&result.stderr).into());
                    }
                }
            }
            Ok(())
        })();
        if let Err(error) = signalled {
            let mut record = entry.lock().unwrap();
            if active(&record.info.status) {
                record.info.status = "running".into();
            }
            record.info.error = Some(error.clone());
            return Err(error);
        }
        for _ in 0..60 {
            let info = self.get(id)?;
            if !active(&info.status) {
                return Ok(info);
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        Err("停止请求已发送，进程尚未确认退出，请查询 get_script_run".into())
    }
    pub fn bytes(&self, id: &str) -> Result<Vec<u8>, String> {
        let entry = self.entry(id)?;
        let record = entry.lock().unwrap();
        let data = record.buffer.lock().unwrap().clone();
        Ok(data)
    }
    pub fn logs(&self, id: &str, max_bytes: usize) -> Result<Value, String> {
        if !(1..=262144).contains(&max_bytes) {
            return Err("max_bytes 必须为 1–262144".into());
        }
        let entry = self.entry(id)?;
        let record = entry.lock().unwrap();
        let buffer = record.buffer.lock().unwrap();
        let start = buffer.len().saturating_sub(max_bytes);
        Ok(
            json!({"run":record.info,"output":String::from_utf8_lossy(&buffer[start..]),"truncated":record.dropped_bytes>0||start>0,"retainedBytes":buffer.len(),"droppedBytes":record.dropped_bytes}),
        )
    }
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        if data.contains(&3) {
            self.stop(id, false)?;
            return Ok(());
        }
        let entry = self.entry(id)?;
        let record = entry.lock().unwrap();
        record.session.as_ref().ok_or("脚本已退出")?.write(data)
    }
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let entry = self.entry(id)?;
        let record = entry.lock().unwrap();
        if let Some(s) = &record.session {
            s.resize(cols, rows)?;
        }
        Ok(())
    }
    pub fn shutdown(&self) {
        if let Ok(runs) = self.list(None, true) {
            for run in runs {
                let _ = self.stop(&run.id, true);
            }
        }
    }
}
#[tauri::command]
pub async fn start_project_script(
    app: AppHandle,
    project_path: String,
    script: String,
) -> Result<ScriptRun, String> {
    let db = storage::database_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        RUNNER.start(&db, &project_path, &script, app_sink(app))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn stop_project_script(run_id: String, force: Option<bool>) -> Result<ScriptRun, String> {
    tauri::async_runtime::spawn_blocking(move || RUNNER.stop(&run_id, force.unwrap_or(false)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn list_script_runs() -> Result<Vec<ScriptRun>, String> {
    RUNNER.list(None, false)
}

#[cfg(all(test, unix))]
mod tests {
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
            if !output.status.success() || state.trim().is_empty() || state.trim().starts_with('Z')
            {
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
}
