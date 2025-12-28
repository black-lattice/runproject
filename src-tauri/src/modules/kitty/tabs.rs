use crate::modules::kitty::core::{KittyTab, TabStatus, KITTY_TAB_MANAGER};
use std::process::Command;

// 使用kitty远程控制创建标签页
pub fn create_kitty_tab(
    socket_path: &str,
    command_id: &str,
    project_name: &str,
    command_name: &str,
    working_dir: &str,
    final_command: &str,
) -> Result<String, String> {
    // 转义工作目录中的特殊字符
    let escaped_working_dir = working_dir.replace("'", "'\\''");
    let tab_title = format!("{} - {} ({})", project_name, command_name, command_id);
    let escaped_tab_title = tab_title.replace("'", "'\\''");

    let display_command = final_command.replace('"', "\\\"");
    let escaped_command = final_command.replace('\'', "'\\''");
    let shell_script = format!(
        "printf '\\n$ %s\\n' \"{}\" && cd '{}' && {} ; exec $SHELL",
        display_command, escaped_working_dir, escaped_command
    );
    let escaped_script = shell_script.replace('\'', "'\\''");

    let kitty_cmd = format!(
        "kitty @ --to '{}' launch --type=tab --tab-title '{}' --cwd '{}' --hold bash -lc '{}'",
        socket_path, escaped_tab_title, escaped_working_dir, escaped_script
    );

    // 添加调试日志
    eprintln!("[DEBUG] 执行kitty命令: {}", kitty_cmd);
    eprintln!("[DEBUG] 工作目录: {}", working_dir);
    eprintln!("[DEBUG] 最终命令: {}", final_command);

    match Command::new("sh").arg("-c").arg(&kitty_cmd).output() {
        Ok(output) => {
            if output.status.success() {
                eprintln!("[DEBUG] kitty命令执行成功");
                Ok("标签页创建成功".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                eprintln!("[DEBUG] kitty命令执行失败 - stderr: {}", stderr);
                eprintln!("[DEBUG] kitty命令执行失败 - stdout: {}", stdout);
                Err(format!("kitty命令执行失败: {}", stderr))
            }
        }
        Err(e) => {
            eprintln!("[DEBUG] 执行kitty命令失败: {}", e);
            Err(format!("执行kitty命令失败: {}", e))
        }
    }
}

// 关闭kitty标签页
pub fn close_kitty_tab(socket_path: &str, tab_id: Option<&str>) -> Result<(), String> {
    let cmd = if let Some(id) = tab_id {
        format!("kitty @ --to '{}' close-tab --match id:{}", socket_path, id)
    } else {
        format!("kitty @ --to '{}' close-tab", socket_path)
    };

    match Command::new("sh").arg("-c").arg(&cmd).output() {
        Ok(output) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("关闭标签页失败: {}", stderr))
            }
        }
        Err(e) => Err(format!("执行关闭命令失败: {}", e)),
    }
}

// 获取标签页列表
pub fn list_kitty_tabs(socket_path: &str) -> Result<Vec<serde_json::Value>, String> {
    let cmd = format!("kitty @ --to '{}' ls --json", socket_path);

    match Command::new("sh").arg("-c").arg(&cmd).output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                match serde_json::from_str::<serde_json::Value>(&stdout) {
                    Ok(json) => {
                        if let Some(tabs) = json.as_array() {
                            Ok(tabs.clone())
                        } else {
                            Ok(Vec::new())
                        }
                    }
                    Err(e) => Err(format!("解析标签页信息失败: {}", e)),
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("获取标签页列表失败: {}", stderr))
            }
        }
        Err(e) => Err(format!("执行命令失败: {}", e)),
    }
}

// 获取标签页状态
pub fn get_tab_status(tab_id: &str) -> Result<Option<KittyTab>, String> {
    if let Ok(manager) = KITTY_TAB_MANAGER.lock() {
        Ok(manager.get(tab_id).cloned())
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 更新标签页状态
pub fn update_tab_status(tab_id: &str, status: TabStatus) -> Result<(), String> {
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        if let Some(tab) = manager.get_mut(tab_id) {
            tab.status = status;
            Ok(())
        } else {
            Err("标签页不存在".to_string())
        }
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 注册新的标签页
pub fn register_kitty_tab(tab: KittyTab) -> Result<(), String> {
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        manager.insert(tab.id.clone(), tab);
        Ok(())
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 移除标签页
pub fn unregister_kitty_tab(tab_id: &str) -> Result<Option<KittyTab>, String> {
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        Ok(manager.remove(tab_id))
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 获取所有标签页
pub fn get_all_tabs() -> Result<Vec<KittyTab>, String> {
    if let Ok(manager) = KITTY_TAB_MANAGER.lock() {
        Ok(manager.values().cloned().collect())
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 清理已完成的标签页
pub fn cleanup_completed_tabs() -> Result<usize, String> {
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        let initial_count = manager.len();
        manager.retain(|_, tab| {
            !matches!(
                tab.status,
                TabStatus::Completed | TabStatus::Error | TabStatus::Terminated
            )
        });
        Ok(initial_count - manager.len())
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}
