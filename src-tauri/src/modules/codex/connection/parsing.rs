use super::super::types::{CodexIncomingMessage, JsonRpcResponse};
use serde_json::Value;

pub fn try_parse_message(buffer: &[u8]) -> Option<(CodexIncomingMessage, usize)> {
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
    buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|pos| pos + 4)
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
