use super::super::types::{CodexIncomingMessage, JsonRpcRequest};
use super::io::{spawn_stderr_reader, spawn_stdout_reader};
use serde_json::Value;
use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

pub struct CodexConnection {
    child: Mutex<Child>,
    stdin: Arc<Mutex<ChildStdin>>,
    next_id: AtomicU64,
    framing: Framing,
    waiters: Arc<Mutex<std::collections::HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
}

#[derive(Clone, Copy)]
pub enum Framing {
    ContentLength,
    Line,
}

impl CodexConnection {
    pub fn spawn(
        cli_path: &str,
        cli_args: &[String],
        framing: Framing,
        on_message: Arc<dyn Fn(CodexIncomingMessage) + Send + Sync>,
        on_stderr: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<Arc<Self>, String> {
        let mut command = Command::new(cli_path);
        command
            .args(cli_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        Self::spawn_from_command(command, framing, on_message, on_stderr)
    }

    pub fn spawn_from_command(
        mut command: Command,
        framing: Framing,
        on_message: Arc<dyn Fn(CodexIncomingMessage) + Send + Sync>,
        on_stderr: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<Arc<Self>, String> {
        // Ensure standard I/O is piped
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let mut child = command.spawn().map_err(|e| format!("启动 Codex 失败: {}", e))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "无法获取 Codex stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "无法获取 Codex stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "无法获取 Codex stderr".to_string())?;

        let waiters = Arc::new(Mutex::new(std::collections::HashMap::new()));
        let stdin = Arc::new(Mutex::new(stdin));

        let connection = Arc::new(Self {
            child: Mutex::new(child),
            stdin: stdin.clone(),
            next_id: AtomicU64::new(1),
            framing,
            waiters: waiters.clone(),
        });

        spawn_stdout_reader(stdout, stdin, waiters, on_message.clone());
        spawn_stderr_reader(stderr, on_stderr);

        Ok(connection)
    }

    pub fn send_request(&self, method: &str, params: Option<Value>) -> Result<u64, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };
        self.write_json(&serde_json::to_value(request).map_err(|e| e.to_string())?)?;
        Ok(id)
    }

    pub fn send_request_and_wait(
        &self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Value, String> {
        let (tx, rx) = mpsc::channel();
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };
        {
            let mut waiters = self.waiters.lock().map_err(|e| e.to_string())?;
            waiters.insert(id, tx);
        }
        if let Err(error) = self.write_json(&serde_json::to_value(request).map_err(|e| e.to_string())?) {
            let mut waiters = self.waiters.lock().map_err(|e| e.to_string())?;
            waiters.remove(&id);
            return Err(error);
        }
        match rx.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let mut waiters = self.waiters.lock().map_err(|e| e.to_string())?;
                waiters.remove(&id);
                Err(format!("请求超时: {}", method))
            }
            Err(_) => {
                let mut waiters = self.waiters.lock().map_err(|e| e.to_string())?;
                waiters.remove(&id);
                Err(format!("请求中断: {}", method))
            }
        }
    }

    pub fn ping(&self, timeout: Duration) -> bool {
        self.send_request_and_wait("ping", None, timeout).is_ok()
    }

    pub fn wait_for_server_ready(&self, timeout: Duration) -> Result<(), String> {
        let start = Instant::now();
        let step = Duration::from_secs(2);
        let ping_timeout = Duration::from_secs(3);
        loop {
            if self.ping(ping_timeout) {
                return Ok(())
            }
            if start.elapsed() >= timeout {
                return Err("等待 MCP 就绪超时".to_string());
            }
            std::thread::sleep(step);
        }
    }

    pub fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        self.write_json(&notification)
    }

    pub fn send_response(&self, id: u64, result: Value) -> Result<(), String> {
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        });
        self.write_json(&response)
    }

    pub fn send_error(&self, id: u64, code: i64, message: &str) -> Result<(), String> {
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": code,
                "message": message,
            }
        });
        self.write_json(&response)
    }

    pub fn terminate(&self) -> Result<(), String> {
        let mut child = self.child.lock().map_err(|e| e.to_string())?;
        child.kill().map_err(|e| format!("终止 Codex 失败: {}", e))?;
        Ok(())
    }

    fn write_json(&self, value: &Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        let payload = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let message = match self.framing {
            Framing::ContentLength => format!(
                "Content-Length: {}\r\n\r\n{}",
                payload.as_bytes().len(),
                payload
            ),
            Framing::Line => format!("{}\n", payload),
        };
        stdin
            .write_all(message.as_bytes())
            .map_err(|e| format!("写入 Codex 失败: {}", e))?;
        stdin.flush().map_err(|e| format!("刷新 Codex 失败: {}", e))?;
        Ok(())
    }
}
