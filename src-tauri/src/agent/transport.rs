//! Local Codex JSON-RPC transport. Requests and notifications share one reader.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::Duration;

type Reply = Result<Value, String>;
pub struct Connection {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, mpsc::Sender<Reply>>>,
    subscribers: Mutex<Vec<mpsc::Sender<Value>>>,
    next_id: AtomicU64,
    pub alive: AtomicBool,
    pub binary: String,
}

pub fn resolve_binary(configured: &str) -> Result<String, String> {
    if !configured.trim().is_empty() && configured != "codex" {
        if !std::path::Path::new(configured).is_file() {
            return Err("Codex 路径不存在，请选择本机 codex 可执行文件".into());
        }
        return Ok(configured.to_owned());
    }
    #[cfg(windows)]
    let output = Command::new("where.exe").arg("codex").output();
    #[cfg(not(windows))]
    let output = crate::modules::platform::build_shell_command("command -v codex").output();
    let output = output.map_err(|e| format!("检测 Codex 失败: {e}"))?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|p| std::path::Path::new(p).is_file())
        .map(str::to_owned)
        .ok_or_else(|| "未找到 Codex CLI，请先安装并登录，或填写可执行文件绝对路径".into())
}

impl Connection {
    pub fn start(
        binary: &str,
        on_event: Arc<dyn Fn(Value) + Send + Sync>,
    ) -> Result<Arc<Self>, String> {
        let binary = resolve_binary(binary)?;
        let mut command = Command::new(&binary);
        command
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Finder-launched desktop apps often have a minimal PATH. Keep the user's
        // login-shell PATH so Codex's node/git/package-manager tools remain usable.
        #[cfg(not(windows))]
        if let Ok(output) =
            crate::modules::platform::build_shell_command("printf %s \"$PATH\"").output()
        {
            if output.status.success() {
                command.env("PATH", String::from_utf8_lossy(&output.stdout).trim());
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("启动 codex app-server 失败: {e}"))?;
        let stdin = child.stdin.take().ok_or("无法读取 Codex stdin")?;
        let stdout = child.stdout.take().ok_or("无法读取 Codex stdout")?;
        let stderr = child.stderr.take().ok_or("无法读取 Codex stderr")?;
        let connection = Arc::new(Self {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            subscribers: Mutex::new(Vec::new()),
            next_id: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            binary,
        });
        // Drain stderr to avoid deadlock. It may contain private tool diagnostics;
        // do not forward raw stderr into application-wide logs.
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                if line.is_err() {
                    break;
                }
            }
        });
        let weak = Arc::downgrade(&connection);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Some(conn) = weak.upgrade() else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if message.get("method").is_none() {
                    if let Some(id) = message["id"].as_u64() {
                        if let Some(sender) = conn.pending.lock().unwrap().remove(&id) {
                            let reply = if let Some(error) = message.get("error") {
                                Err(error["message"]
                                    .as_str()
                                    .unwrap_or("Codex 请求失败")
                                    .to_owned())
                            } else {
                                Ok(message["result"].clone())
                            };
                            let _ = sender.send(reply);
                        }
                    }
                } else {
                    conn.subscribers
                        .lock()
                        .unwrap()
                        .retain(|s| s.send(message.clone()).is_ok());
                    on_event(message);
                }
            }
            if let Some(conn) = weak.upgrade() {
                conn.alive.store(false, Ordering::SeqCst);
                for (_, sender) in conn.pending.lock().unwrap().drain() {
                    let _ = sender.send(Err("Codex app-server 已断开".into()));
                }
                let event = json!({"method":"runproject/disconnected"});
                conn.subscribers
                    .lock()
                    .unwrap()
                    .retain(|s| s.send(event.clone()).is_ok());
                on_event(event);
            }
        });
        let result = connection
            .request(
                "initialize",
                json!({"clientInfo":{
                    "name":"runproject", "title":"RunProject", "version":env!("CARGO_PKG_VERSION")
                }}),
            )
            .and_then(|_| connection.write(&json!({"method":"initialized","params":{}})));
        if let Err(error) = result {
            connection.shutdown();
            return Err(error);
        }
        Ok(connection)
    }

    pub fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::channel();
        self.subscribers.lock().unwrap().push(tx);
        rx
    }

    pub fn write(&self, message: &Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().unwrap();
        writeln!(stdin, "{message}")
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("写入 Codex 失败: {e}"))
    }

    pub fn request(&self, method: &str, params: Value) -> Reply {
        if !self.alive.load(Ordering::SeqCst) {
            return Err("Codex app-server 已断开，请重新连接".into());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap().insert(id, tx);
        if let Err(error) = self.write(&json!({"id":id,"method":method,"params":params})) {
            self.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        let reply = rx
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| format!("Codex 请求超时: {method}"));
        self.pending.lock().unwrap().remove(&id);
        reply?
    }

    pub fn shutdown(&self) {
        self.alive.store(false, Ordering::SeqCst);
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn fake_server() -> Fixture {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("runproject-codex-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, r#"#!/usr/bin/env python3
import sys,json
for line in sys.stdin:
    r=json.loads(line)
    method=r.get('method')
    if method=='test/disconnect': sys.exit(0)
    if method=='test/events':
        print(json.dumps({'method':'turn/completed','params':{'threadId':'worker','turn':{'id':'turn-1','status':'completed'}}}),flush=True)
        print(json.dumps({'id':r['id'],'method':'item/commandExecution/requestApproval','params':{'threadId':'worker'}}),flush=True)
    if 'id' in r and method:
        print(json.dumps({'id':r['id'],'result':r.get('params',{})}),flush=True)
"#).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        Fixture(path)
    }

    #[test]
    fn separates_server_requests_from_replies_and_keeps_early_events() {
        let fixture = fake_server();
        let conn = Connection::start(fixture.0.to_str().unwrap(), Arc::new(|_| {})).unwrap();
        let events = conn.subscribe();
        let result = conn.request("test/events", json!({"marker":42})).unwrap();
        assert_eq!(result["marker"], 42);
        assert_eq!(
            events.recv_timeout(Duration::from_secs(2)).unwrap()["method"],
            "turn/completed"
        );
        assert_eq!(
            events.recv_timeout(Duration::from_secs(2)).unwrap()["method"],
            "item/commandExecution/requestApproval"
        );
        // A long-running worker and coordinator share one transport safely.
        let threads: Vec<_> = (0..8)
            .map(|marker| {
                let conn = conn.clone();
                std::thread::spawn(move || {
                    assert_eq!(
                        conn.request("test/echo", json!({"marker":marker})).unwrap()["marker"],
                        marker
                    )
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        conn.shutdown();
    }

    #[test]
    fn disconnect_fails_pending_requests_instead_of_hanging() {
        let fixture = fake_server();
        let conn = Connection::start(fixture.0.to_str().unwrap(), Arc::new(|_| {})).unwrap();
        let start = std::time::Instant::now();
        assert!(conn
            .request("test/disconnect", json!({}))
            .unwrap_err()
            .contains("断开"));
        assert!(start.elapsed() < Duration::from_secs(5));
        assert!(!conn.alive.load(Ordering::SeqCst));
    }
}
