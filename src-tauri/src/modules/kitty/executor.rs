use crate::modules::kitty::connection::{
    get_socket_path, start_kitty_instance, test_kitty_connection,
};
use crate::modules::kitty::core::{get_current_timestamp, KittyTab, TabStatus, PROCESS_MANAGER};
use crate::modules::kitty::tabs::{create_kitty_tab, register_kitty_tab};
use crate::modules::nvm_manager;

// 生成包管理器特定的命令前缀
fn get_package_manager_prefix(package_manager: &str, command: &str) -> String {
    // 分析命令类型，生成合适的包管理器前缀
    let cmd_lower = command.to_lowercase();

    // 如果命令已经包含了包管理器命令，不添加前缀
    if cmd_lower.starts_with("npm ")
        || cmd_lower.starts_with("yarn ")
        || cmd_lower.starts_with("pnpm ")
    {
        return String::new();
    }

    // 根据命令类型选择合适的包管理器前缀
    match package_manager {
        "yarn" => {
            if cmd_lower.starts_with("install")
                || cmd_lower.starts_with("add")
                || cmd_lower.starts_with("remove")
            {
                "yarn ".to_string()
            } else {
                "yarn run ".to_string()
            }
        }
        "pnpm" => {
            if cmd_lower.starts_with("install")
                || cmd_lower.starts_with("add")
                || cmd_lower.starts_with("remove")
            {
                "pnpm ".to_string()
            } else {
                "pnpm run ".to_string()
            }
        }
        "npm" => {
            // npm 总是需要 run 前缀来执行 scripts
            "npm run ".to_string()
        }
        _ => {
            // 默认使用 npm
            "npm run ".to_string()
        }
    }
}

// 构建完整的执行命令
pub fn build_execution_command(
    command: &str,
    node_version: Option<&str>,
    package_manager: &str,
) -> Result<String, String> {
    let pm_prefix = get_package_manager_prefix(package_manager, command);
    let mut final_command = format!("{}{}", pm_prefix, command);

    if let Some(version) = node_version {
        final_command = nvm_manager::wrap_command_with_node(version, &final_command)?;
    }

    Ok(final_command)
}

// 在kitty终端中执行命令（传统方式）
#[tauri::command]
pub fn execute_command_in_kitty(
    command_id: String,
    working_dir: String,
    command: String,
    node_version: Option<String>,
    project_name: String,
    command_name: String,
    package_manager: String,
) -> Result<serde_json::Value, String> {
    let mut result_output = String::new();

    // 显示执行的详细信息
    result_output.push_str(&format!("📁 工作目录: {}\n", working_dir));
    result_output.push_str(&format!("📂 项目名称: {}\n", project_name));
    result_output.push_str(&format!("🔧 原始命令: {}\n", command));
    result_output.push_str(&format!("🚀 命令名称: {}\n", command_name));
    result_output.push_str(&format!("📦 包管理器: {}\n", package_manager));

    // 构建完整的执行命令
    let final_command =
        build_execution_command(&command, node_version.as_deref(), &package_manager)?;

    result_output.push_str(&format!("📝 完整命令: {}\n", final_command));

    // 添加调试日志
    eprintln!("[DEBUG] 构建的执行命令: {}", final_command);
    eprintln!("[DEBUG] 原始命令: {}", command);
    eprintln!("[DEBUG] Node版本: {:?}", node_version);
    eprintln!("[DEBUG] 包管理器: {}", package_manager);

    let socket_path = get_socket_path(
        &command_id,
        &crate::modules::kitty::core::KittyConfig::default(),
    );
    result_output.push_str(&format!("🔌 控制socket: {}\n", socket_path));

    // 使用kitty终端执行命令，开启远程控制功能
    let kitty_command = format!(
        "kitty --title '{} - {}' --listen-on '{}' --config NONE --directory '{}' --hold bash -c '{}'",
        project_name,
        command_name,
        socket_path,
        working_dir,
        final_command.replace("'", "'\\''") // 转义单引号
    );

    result_output.push_str("\n🖥️ 正在使用kitty终端执行...\n");

    // 使用spawn()而不是output()来避免等待kitty进程完成
    match std::process::Command::new("bash")
        .arg("-c")
        .arg(&kitty_command)
        .spawn()
    {
        Ok(child) => {
            // 保存进程句柄到全局管理器
            if let Ok(mut manager) = PROCESS_MANAGER.lock() {
                let manager: &mut std::collections::HashMap<String, std::process::Child> =
                    &mut manager;
                manager.insert(command_id.clone(), child);
            }

            result_output.push_str("✅ kitty终端启动成功\n");
            Ok(serde_json::json!({
                "success": true,
                "message": format!("在kitty终端中成功启动命令: {}", command_name),
                "output": result_output,
                "project": project_name,
                "command": command_name,
                "command_id": command_id
            }))
        }
        Err(e) => {
            result_output.push_str(&format!("❌ 启动kitty终端失败: {}\n", e));

            Ok(serde_json::json!({
                "success": false,
                "error": format!("启动kitty终端失败: {}", e),
                "output": result_output,
                "project": project_name,
                "command": command_name
            }))
        }
    }
}

// 使用kitty远程控制执行命令
#[tauri::command]
pub fn execute_command_with_kitten(
    command_id: String,
    working_dir: String,
    command: String,
    node_version: Option<String>,
    project_name: String,
    command_name: String,
    package_manager: String,
) -> Result<serde_json::Value, String> {
    let mut result_output = String::new();

    // 显示执行的详细信息
    result_output.push_str(&format!("📁 工作目录: {}\n", working_dir));
    result_output.push_str(&format!("📂 项目名称: {}\n", project_name));
    result_output.push_str(&format!("🔧 原始命令: {}\n", command));
    result_output.push_str(&format!("🚀 命令名称: {}\n", command_name));
    result_output.push_str(&format!("📦 包管理器: {}\n", package_manager));

    // 构建完整的执行命令
    let final_command =
        build_execution_command(&command, node_version.as_deref(), &package_manager)?;

    result_output.push_str(&format!("📝 完整命令: {}\n", final_command));

    let config = crate::modules::kitty::core::KittyConfig::default();
    let socket_path = get_socket_path(&command_id, &config);
    result_output.push_str(&format!("🔌 控制socket: {}\n", socket_path));

    // 测试连接，如果不存在则启动kitty实例
    match test_kitty_connection(&socket_path) {
        Ok(true) => {
            result_output.push_str("✅ 已连接到现有kitty实例\n");
        }
        Ok(false) => {
            result_output.push_str("🔄 未找到kitty实例，正在启动新的kitty...\n");

            match start_kitty_instance(&socket_path, &working_dir, &config) {
                Ok(pid) => {
                    result_output.push_str(&format!("✅ kitty实例启动成功 (PID: {})\n", pid));
                }
                Err(e) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "error": format!("启动kitty实例失败: {}", e),
                        "output": result_output,
                        "project": project_name,
                        "command": command_name
                    }));
                }
            }
        }
        Err(e) => {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("连接测试失败: {}", e),
                "output": result_output,
                "project": project_name,
                "command": command_name
            }));
        }
    }

    // 创建新的标签页记录
    let tab_title = format!("{} - {} ({})", project_name, command_name, command_id);
    let new_tab = KittyTab {
        id: command_id.clone(),
        title: tab_title,
        project_name: project_name.clone(),
        command_name: command_name.clone(),
        working_dir: working_dir.clone(),
        command: final_command.clone(),
        socket_path: socket_path.clone(),
        status: TabStatus::Running,
        created_at: get_current_timestamp(),
        pid: None,
    };

    // 注册标签页
    if let Err(e) = register_kitty_tab(new_tab) {
        result_output.push_str(&format!("⚠️ 注册标签页失败: {}\n", e));
    }

    // 使用kitty远程控制创建标签页并执行命令
    match create_kitty_tab(
        &socket_path,
        &command_id,
        &project_name,
        &command_name,
        &working_dir,
        &final_command,
    ) {
        Ok(_) => {
            result_output.push_str("✅ kitty标签页创建成功\n");

            // 保存命令信息到全局管理器
            if let Ok(mut manager) = PROCESS_MANAGER.lock() {
                let manager: &mut std::collections::HashMap<String, std::process::Child> =
                    &mut manager;
                // 创建一个虚拟的进程记录，用于管理目的
                let dummy_child = std::process::Command::new("echo")
                    .arg("kitty managed")
                    .spawn()
                    .unwrap();
                manager.insert(command_id.clone(), dummy_child);
            }

            Ok(serde_json::json!({
                "success": true,
                "message": format!("在kitty标签页中成功启动命令: {}", command_name),
                "output": result_output,
                "project": project_name,
                "command": command_name,
                "command_id": command_id,
                "socket_path": socket_path
            }))
        }
        Err(e) => {
            result_output.push_str(&format!("❌ 创建kitty标签页失败: {}\n", e));

            Ok(serde_json::json!({
                "success": false,
                "error": format!("创建kitty标签页失败: {}", e),
                "output": result_output,
                "project": project_name,
                "command": command_name
            }))
        }
    }
}
