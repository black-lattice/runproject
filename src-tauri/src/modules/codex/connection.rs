use super::types::{CodexIncomingMessage, JsonRpcRequest, JsonRpcResponse};
use serde_json::Value;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
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
        println!("DEBUG: Spawning process: {} with args: {:?}", cli_path, cli_args);
        
        let mut command = Command::new(cli_path);
        command
            .args(cli_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
            // .env_remove("NODE_OPTIONS")
            // .env_remove("NODE_DEBUG")
            // .env_remove("NODE_INSPECT")
            // .env("CODEX_NO_INTERACTIVE", "1")
            // .env("CODEX_AUTO_CONTINUE", "1");
            // .env_remove("NODE_OPTIONS")
            // .env_remove("NODE_DEBUG")
            // .env_remove("NODE_INSPECT")
            // .env("CODEX_NO_INTERACTIVE", "1")
            // .env("CODEX_AUTO_CONTINUE", "1");

        let mut child = command.spawn().map_err(|e| format!("启动 Codex 失败: {}", e))?;
        println!("DEBUG: Codex process spawned with PID: {}", child.id());
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

        Self::spawn_stdout_reader(stdout, stdin, waiters, on_message.clone());
        Self::spawn_stderr_reader(stderr, on_stderr);

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
                return Ok(());
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
        println!("DEBUG: Writing to Codex stdin: {:?}", message);
        stdin
            .write_all(message.as_bytes())
            .map_err(|e| format!("写入 Codex 失败: {}", e))?;
        stdin.flush().map_err(|e| format!("刷新 Codex 失败: {}", e))?;
        Ok(())
    }

    fn spawn_stdout_reader(
        stdout: ChildStdout,
        stdin: Arc<Mutex<ChildStdin>>,
        waiters: Arc<Mutex<std::collections::HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
        on_message: Arc<dyn Fn(CodexIncomingMessage) + Send + Sync>,
    ) {
        std::thread::spawn(move || {
            let mut reader = stdout;
            let mut buffer: Vec<u8> = Vec::with_capacity(8192);
            let mut chunk = [0u8; 4096];

            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let raw_output = String::from_utf8_lossy(&chunk[..n]).to_string();
                        println!("DEBUG: Codex stdout read {} bytes: {:?}", n, raw_output);
                        buffer.extend_from_slice(&chunk[..n]);
                        loop {
                            match try_parse_message(&buffer) {
                                Some((message, consumed)) => {
                                    buffer.drain(..consumed);
                                    if let CodexIncomingMessage::RawText(ref text) = message {
                                        if text.contains("Press Enter to continue")
                                            || text.contains("Launching Codex CLI")
                                        {
                                            if let Ok(mut stdin) = stdin.lock() {
                                                let _ = stdin.write_all(b"\n");
                                                let _ = stdin.flush();
                                            }
                                        }
                                    }
                                    if let CodexIncomingMessage::Response(ref response) = message {
                                        if let Some(id) = match response {
                                            JsonRpcResponse::Ok { id, .. } => Some(*id),
                                            JsonRpcResponse::Err { id, .. } => Some(*id),
                                        } {
                                            if let Ok(mut waiters) = waiters.lock() {
                                                if let Some(sender) = waiters.remove(&id) {
                                                    let _ = match response {
                                                        JsonRpcResponse::Ok { result, .. } => {
                                                            sender.send(Ok(result.clone()))
                                                        }
                                                        JsonRpcResponse::Err { error, .. } => {
                                                            sender.send(Err(error.message.clone()))
                                                        }
                                                    };
                                                }
                                            }
                                        }
                                    }
                                    on_message(message);
                                }
                                None => break,
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    fn spawn_stderr_reader(stderr: std::process::ChildStderr, on_stderr: Arc<dyn Fn(String) + Send + Sync>) {
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match std::io::BufRead::read_line(&mut reader, &mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end().to_string();
                        if !trimmed.is_empty() {
                            println!("DEBUG: Codex stderr: {}", trimmed);
                            on_stderr(trimmed);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}

fn try_parse_message(buffer: &[u8]) -> Option<(CodexIncomingMessage, usize)> {
    if buffer.is_empty() {
        return None;
    }

    if buffer.starts_with(b"Content-Length:") {
        if let Some(header_end) = find_header_end(buffer) {
            let header = &buffer[..header_end];
            if let Some(content_length) = parse_content_length(header) {
                let total_len = header_end + content_length;
                if buffer.len() < total_len {
                    return None;
                }
                let payload = &buffer[header_end..total_len];
                let message = parse_json_message(payload, false);
                return Some((message, total_len));
            }
        }
        return None;
    }

    if let Some((line, consumed)) = read_line(buffer) {
        if line.trim().is_empty() {
            return Some((CodexIncomingMessage::RawText(String::new()), consumed));
        }
        let message = parse_json_message(line.as_bytes(), true);
        return Some((message, consumed));
    }

    None
}

fn parse_json_message(payload: &[u8], allow_raw: bool) -> CodexIncomingMessage {
    let text = match std::str::from_utf8(payload) {
        Ok(text) => text.trim(),
        Err(err) => return CodexIncomingMessage::ParseError(format!("UTF-8 解析失败: {}", err)),
    };

    let value: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(err) => {
            if allow_raw {
                return CodexIncomingMessage::RawText(text.to_string());
            }
            return CodexIncomingMessage::ParseError(format!("JSON 解析失败: {} ({})", err, text));
        }
    };

    if let Some(method) = value.get("method").and_then(|v| v.as_str()) {
        let params = value.get("params").cloned();
        if let Some(id) = value.get("id").and_then(|v| v.as_u64()) {
            return CodexIncomingMessage::Request {
                id,
                method: method.to_string(),
                params,
            };
        }
        return CodexIncomingMessage::Notification {
            method: method.to_string(),
            params,
        };
    }

    if value.get("id").is_some() {
        if let Ok(response) = serde_json::from_value::<JsonRpcResponse>(value) {
            return CodexIncomingMessage::Response(response);
        }
    }

    CodexIncomingMessage::RawText(text.to_string())
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n").map(|pos| pos + 4)
}

fn parse_content_length(header: &[u8]) -> Option<usize> {
    let header_str = std::str::from_utf8(header).ok()?;
    for line in header_str.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Content-Length:") {
            return rest.trim().parse::<usize>().ok();
        }
    }
    None
}

fn read_line(buffer: &[u8]) -> Option<(String, usize)> {
    let mut index = 0;
    while index < buffer.len() {
        if buffer[index] == b'\n' {
            let line = String::from_utf8_lossy(&buffer[..index]).to_string();
            return Some((line, index + 1));
        }
        index += 1;
    }
    None
}

 
