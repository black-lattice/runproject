use crate::modules::kitty::connection::get_socket_path;
use crate::modules::kitty::core::KittyConfig;
use crate::modules::kitty::core::{KITTY_TAB_MANAGER, PROCESS_MANAGER};
use crate::modules::kitty::tabs::unregister_kitty_tab;
use std::process::Command;

// 终止指定的进程（使用kitty远程控制）
#[tauri::command]
pub fn terminate_command(command_id: String) -> Result<String, String> {
    let config = KittyConfig::default();
    let socket_path = get_socket_path(&command_id, &config);

    // 检查进程是否存在
    let mut process_found = false;
    if let Ok(mut manager) = PROCESS_MANAGER.lock() {
        if let Some(_child) = manager.remove(&command_id) {
            process_found = true;
        }
    }

    if !process_found {
        return Err(format!("未找到运行中的命令: {}", command_id));
    }

    // 尝试多种方法终止命令
    let mut success = false;
    let mut error_msg = String::new();

    // 方法1: 尝试使用kitty远程控制
    let kitty_command = format!("kitty @ --to {} close-window", socket_path);

    if let Ok(output) = Command::new("sh").arg("-c").arg(&kitty_command).output() {
        if output.status.success() {
            success = true;
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error_msg.push_str(&format!("kitty控制失败: {}", stderr));
        }
    } else {
        error_msg.push_str("kitty命令执行失败");
    }

    // 方法2: 如果kitty控制失败，尝试直接终止进程树
    if !success {
        // 使用command_id来匹配相关进程
        let kill_pattern = command_id.replace('-', "_");
        let kill_command = format!("pkill -f '{}' || echo '未找到相关进程'", kill_pattern);

        if let Ok(output) = Command::new("sh").arg("-c").arg(&kill_command).output() {
            if output.status.success() {
                success = true;
                error_msg = format!("已强制终止相关进程");
            } else {
                error_msg.push_str(&format!(
                    " | 强制终止也失败: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
        } else {
            error_msg.push_str(" | 强制终止命令执行失败");
        }
    }

    // 清理标签页记录
    let _ = unregister_kitty_tab(&command_id);

    if success {
        Ok(format!("命令 {} 已终止", command_id))
    } else {
        Err(format!("终止命令失败: {}", error_msg))
    }
}

// 获取所有运行中的进程
#[tauri::command]
pub fn get_running_processes() -> Result<Vec<crate::modules::kitty::core::KittyTab>, String> {
    if let Ok(manager) = KITTY_TAB_MANAGER.lock() {
        let tabs: Vec<_> = manager.values().cloned().collect();
        Ok(tabs)
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 清理所有已完成的进程
#[tauri::command]
pub fn cleanup_completed_processes() -> Result<usize, String> {
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        let initial_count = manager.len();
        manager.retain(|_, tab| {
            !matches!(
                tab.status,
                crate::modules::kitty::core::TabStatus::Completed
                    | crate::modules::kitty::core::TabStatus::Error
                    | crate::modules::kitty::core::TabStatus::Terminated
            )
        });
        Ok(initial_count - manager.len())
    } else {
        Err("无法访问标签页管理器".to_string())
    }
}

// 关闭所有标签页并清理资源
pub fn shutdown_all_kitty_instances() -> Result<(), String> {
    // 获取所有socket路径
    let socket_paths: Vec<String> = {
        if let Ok(manager) = KITTY_TAB_MANAGER.lock() {
            manager
                .values()
                .map(|tab| tab.socket_path.clone())
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect()
        } else {
            Vec::new()
        }
    };

    // 关闭所有kitty实例
    for socket_path in socket_paths {
        let _ = crate::modules::kitty::connection::stop_kitty_instance(&socket_path);
    }

    // 清理所有标签页记录
    if let Ok(mut manager) = KITTY_TAB_MANAGER.lock() {
        manager.clear();
    }

    // 清理所有进程记录
    if let Ok(mut manager) = PROCESS_MANAGER.lock() {
        manager.clear();
    }

    Ok(())
}
