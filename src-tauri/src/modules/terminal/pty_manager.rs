use super::session::{TerminalConfig, TerminalSession};
use base64::{engine::general_purpose, Engine as _};
use lazy_static::lazy_static;
use serde_json;
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

lazy_static! {
    static ref SESSIONS: Arc<Mutex<HashMap<String, TerminalSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

const MAX_BUFFER_SIZE: usize = 1024 * 1024 * 2; // 2 MB
const COMMAND_DONE_MARKER: &str = "__RUNPROJECT_CMD_DONE__:";

#[tauri::command]
pub fn create_terminal_session(
    app: AppHandle,
    session_id: String,
    config: TerminalConfig,
) -> Result<String, String> {
    let session = TerminalSession::new(config)?;

    // 启动读取线程
    let master = session.master.clone();
    let buffer_handle = session.buffer.clone();
    let id = session_id.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let mut reader = {
            let master_guard = master.lock().unwrap();
            match master_guard.try_clone_reader() {
                Ok(reader) => reader,
                Err(e) => {
                    eprintln!("克隆 reader 失败: {}", e);
                    return;
                }
            }
        };

        let mut chunk = [0u8; 8192];
        let mut marker_carry = String::new();
        loop {
            match reader.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    let data = &chunk[..n];
                    let encoded = general_purpose::STANDARD.encode(data);
                    let text = String::from_utf8_lossy(data);
                    emit_command_done_markers(&app_clone, &id, &text, &mut marker_carry);

                    {
                        let data_to_store = if n > MAX_BUFFER_SIZE {
                            &data[n - MAX_BUFFER_SIZE..]
                        } else {
                            data
                        };
                        let mut history = buffer_handle.lock().unwrap();
                        let overflow = history
                            .len()
                            .saturating_add(data_to_store.len())
                            .saturating_sub(MAX_BUFFER_SIZE);
                        if overflow > 0 {
                            history.drain(..overflow);
                        }
                        history.extend_from_slice(data_to_store);
                    }

                    if let Err(e) = app_clone.emit(&format!("terminal-output-{}", id), encoded) {
                        eprintln!("发送数据失败: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("读取失败: {}", e);
                    break;
                }
            }
        }

        let mut sessions = SESSIONS.lock().unwrap();
        sessions.remove(&id);
        let _ = app_clone.emit(&format!("terminal-closed-{}", id), ());
        let _ = app_clone.emit("terminal-closed", serde_json::json!({ "sessionId": id }));
    });

    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    sessions.insert(session_id.clone(), session);

    Ok(session_id)
}

#[tauri::command]
pub fn write_to_terminal(session_id: String, data: String) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;

    let decoded = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("解码失败: {}", e))?;
    session.write(&decoded)?;

    Ok(())
}

#[tauri::command]
pub fn resize_terminal(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;

    session.resize(cols, rows)?;
    Ok(())
}

#[tauri::command]
pub fn close_terminal_session(session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    if let Some(session) = sessions.remove(&session_id) {
        let _ = session.terminate();
    }
    Ok(())
}

#[tauri::command]
pub fn ping_terminal_session(session_id: String) -> Result<bool, String> {
    let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    Ok(sessions.contains_key(&session_id))
}

#[tauri::command]
pub fn get_terminal_buffer(session_id: String) -> Result<Option<String>, String> {
    let sessions = SESSIONS.lock().map_err(|e| format!("获取锁失败: {}", e))?;
    if let Some(session) = sessions.get(&session_id) {
        let buffer = session
            .buffer
            .lock()
            .map_err(|e| format!("获取缓冲区失败: {}", e))?;
        if buffer.is_empty() {
            return Ok(None);
        }
        let encoded = general_purpose::STANDARD.encode(&*buffer);
        Ok(Some(encoded))
    } else {
        Ok(None)
    }
}

fn emit_command_done_markers(
    app: &AppHandle,
    session_id: &str,
    text: &str,
    marker_carry: &mut String,
) {
    let combined = format!("{}{}", marker_carry, text);
    let mut search_from = 0usize;

    while let Some(relative_start) = combined[search_from..].find(COMMAND_DONE_MARKER) {
        let marker_start = search_from + relative_start;
        let mut index = marker_start + COMMAND_DONE_MARKER.len();
        let bytes = combined.as_bytes();

        let run_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index >= bytes.len() {
            *marker_carry = combined[marker_start..].to_string();
            return;
        }
        if run_start == index || bytes[index] != b':' {
            search_from = marker_start + COMMAND_DONE_MARKER.len();
            continue;
        }

        let run_id = match combined[run_start..index].parse::<u64>() {
            Ok(value) => value,
            Err(_) => {
                search_from = marker_start + COMMAND_DONE_MARKER.len();
                continue;
            }
        };

        index += 1;
        let exit_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if exit_start == index {
            *marker_carry = combined[marker_start..].to_string();
            return;
        }

        if let Ok(exit_code) = combined[exit_start..index].parse::<i32>() {
            let _ = app.emit(
                "command-finished",
                serde_json::json!({
                    "sessionId": session_id,
                    "runId": run_id,
                    "exitCode": exit_code
                }),
            );
        }

        search_from = index;
    }

    let trailing = &combined.as_bytes()[search_from..];
    let max_suffix = COMMAND_DONE_MARKER.len().saturating_sub(1);
    let trailing_start = trailing.len().saturating_sub(max_suffix);
    let trailing = &trailing[trailing_start..];
    let marker = COMMAND_DONE_MARKER.as_bytes();

    for index in 0..trailing.len() {
        let suffix = &trailing[index..];
        if marker.starts_with(suffix) {
            *marker_carry = String::from_utf8_lossy(suffix).to_string();
            return;
        }
    }

    marker_carry.clear();
}
