use crate::modules::kitty::core::{sanitize_command_id, KittyConfig};
use std::path::Path;
use std::process::{Command, Stdio};

// 获取socket路径（跨平台兼容）
pub fn get_socket_path(command_id: &str, config: &KittyConfig) -> String {
    let sanitized_id = sanitize_command_id(command_id);

    #[cfg(target_os = "linux")]
    {
        format!("unix:@{}-{}", config.socket_prefix, sanitized_id)
    }
    #[cfg(target_os = "macos")]
    {
        format!("unix:/tmp/{}-{}.sock", config.socket_prefix, sanitized_id)
    }
}

// 检查Kitty是否安装
pub fn check_kitty_installed() -> Result<bool, String> {
    match Command::new("which").arg("kitty").output() {
        Ok(output) => Ok(output.status.success()),
        Err(e) => Err(format!("检查kitty安装状态失败: {}", e)),
    }
}

// 检查远程控制是否可用（复用kitty命令）
pub fn check_kitten_available() -> Result<bool, String> {
    match Command::new("kitty").arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(e) => Err(format!("检查kitty命令失败: {}", e)),
    }
}

// 测试kitty连接
pub fn test_kitty_connection(socket_path: &str) -> Result<bool, String> {
    let test_cmd = format!("kitty @ --to '{}' ls", socket_path);

    match Command::new("sh")
        .arg("-c")
        .arg(&test_cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                Ok(true)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!(
                    "[KITTY][连接测试] 尚未就绪: socket={} stderr={}",
                    socket_path,
                    stderr.trim()
                );
                Ok(false)
            }
        }
        Err(e) => Err(format!("连接测试失败: {}", e)),
    }
}

// 获取Kitty实例信息
pub fn get_kitty_instance_info(socket_path: &str) -> Result<serde_json::Value, String> {
    let cmd = format!("kitty @ --to '{}' ls --json", socket_path);

    match Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                match serde_json::from_str::<serde_json::Value>(&stdout) {
                    Ok(json) => Ok(json),
                    Err(e) => Err(format!("解析kitty信息失败: {}", e)),
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("获取kitty信息失败: {}", stderr))
            }
        }
        Err(e) => Err(format!("执行命令失败: {}", e)),
    }
}

// 启动kitty实例
pub fn start_kitty_instance(
    socket_path: &str,
    working_dir: &str,
    config: &KittyConfig,
) -> Result<u32, String> {
    // 检查kitty是否已安装
    if !check_kitty_installed()? {
        return Err("Kitty未安装。请先安装Kitty终端。".to_string());
    }

    // 检查kitty命令是否可用
    if !check_kitten_available()? {
        return Err("Kitten不可用。请确保Kitty已正确安装。".to_string());
    }

    let config_arg = config
        .config_file
        .as_ref()
        .map(|f| format!("--config {}", f))
        .unwrap_or_default();

    cleanup_stale_socket(socket_path);

    let escaped_dir = working_dir.replace('\'', "'\\''");
    let start_cmd = format!(
        "kitty --listen-on '{}' {} --directory '{}' --override allow_remote_control=yes",
        socket_path, config_arg, escaped_dir
    );
    eprintln!("[KITTY] 启动命令: {}", start_cmd);

    let mut process = Command::new("sh");
    process.env("KITTY_SINGLE_INSTANCE", "no");

    match process.arg("-c").arg(&start_cmd).spawn() {
        Ok(mut child) => {
            let pid = child.id();

            // 等待并验证连接
            let mut retries = 0;

            while retries < config.max_retries {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(format!("kitty 进程提前退出: {}", status));
                }

                std::thread::sleep(std::time::Duration::from_millis(config.retry_delay_ms));

                match test_kitty_connection(socket_path) {
                    Ok(true) => {
                        eprintln!(
                            "[KITTY] socket就绪: {} (尝试{}次)",
                            socket_path,
                            retries + 1
                        );
                        return Ok(pid);
                    }
                    Ok(false) => {
                        eprintln!(
                            "[KITTY] socket未就绪，等待重试 {}/{}",
                            retries + 1,
                            config.max_retries
                        );
                    }
                    Err(err) => {
                        eprintln!("[KITTY] 连接测试失败: {}", err);
                    }
                }

                retries += 1;
            }

            Err(format!(
                "等待kitty socket连接超时 (重试{}次)",
                config.max_retries
            ))
        }
        Err(e) => Err(format!("启动kitty实例失败: {}", e)),
    }
}

fn cleanup_stale_socket(socket_path: &str) {
    #[cfg(target_os = "macos")]
    {
        if let Some(path) = socket_path.strip_prefix("unix:") {
            let path = Path::new(path);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

// 关闭kitty实例
pub fn stop_kitty_instance(socket_path: &str) -> Result<(), String> {
    let cmd = format!("kitty @ --to '{}' quit", socket_path);

    match Command::new("sh").arg("-c").arg(&cmd).output() {
        Ok(_) => {
            // 清理socket文件（仅macOS）
            #[cfg(target_os = "macos")]
            if socket_path.starts_with("unix:/tmp/") {
                let file_path = socket_path.trim_start_matches("unix:");
                let _ = std::fs::remove_file(file_path);
            }
            Ok(())
        }
        Err(e) => Err(format!("关闭kitty实例失败: {}", e)),
    }
}
