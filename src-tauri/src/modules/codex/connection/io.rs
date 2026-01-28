use std::io::Read;
use std::process::ChildStdout;
use std::sync::{mpsc, Arc, Mutex};
use std::process::ChildStdin;
use std::io::Write;
use serde_json::Value;
use super::super::types::{CodexIncomingMessage, JsonRpcResponse};
use super::parsing::try_parse_message;

pub fn spawn_stdout_reader(
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

pub fn spawn_stderr_reader(stderr: std::process::ChildStderr, on_stderr: Arc<dyn Fn(String) + Send + Sync>) {
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
                        println!("[CODEX] stderr: {}", trimmed);
                        on_stderr(trimmed);
                    }
                }
                Err(_) => break,
            }
        }
    });
}
