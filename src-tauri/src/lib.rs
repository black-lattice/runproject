use std::path::Path;

// 导入模块
mod modules;
use modules::editor;
use modules::nvm_manager;
use modules::platform;
use modules::project_scanner;
use modules::tray;
use tauri_plugin_mcp::Builder as McpBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn add_workspace(path: String) -> Result<project_scanner::Workspace, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let workspace_name = Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_string();

        let projects = project_scanner::scan_workspace(&path)?;

        Ok(project_scanner::Workspace {
            path,
            name: workspace_name,
            projects,
        })
    })
    .await
    .map_err(|error| format!("扫描 workspace 任务失败: {}", error))?
}

#[tauri::command]
async fn scan_workspace_projects(
    workspace_path: String,
) -> Result<Vec<project_scanner::Project>, String> {
    tauri::async_runtime::spawn_blocking(move || project_scanner::scan_workspace(&workspace_path))
        .await
        .map_err(|error| format!("扫描 workspace 项目任务失败: {}", error))?
}

#[tauri::command]
async fn scan_project(project_path: String) -> Result<project_scanner::Project, String> {
    tauri::async_runtime::spawn_blocking(move || project_scanner::scan_project(&project_path))
        .await
        .map_err(|error| format!("扫描项目任务失败: {}", error))?
}

#[tauri::command]
async fn get_nvm_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(nvm_manager::get_nvm_status)
        .await
        .map_err(|error| format!("获取 Node 版本状态任务失败: {}", error))?
}

#[tauri::command]
async fn ensure_node_version(version: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || nvm_manager::ensure_node_version(version))
        .await
        .map_err(|error| format!("切换 Node 版本任务失败: {}", error))?
}

#[tauri::command]
async fn switch_to_highest_version(versions: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || nvm_manager::switch_to_highest_version(versions))
        .await
        .map_err(|error| format!("切换最高 Node 版本任务失败: {}", error))?
}

fn execute_project_command_impl(
    _command_id: String,
    working_dir: String,
    command: String,
    node_version: Option<String>,
) -> Result<String, String> {
    let mut result_output = String::new();

    result_output.push_str(&format!("📁 工作目录: {}\n", working_dir));
    result_output.push_str(&format!("🔧 执行命令: {}\n", command));

    if let Some(version) = node_version {
        result_output.push_str(&format!("📋 使用Node版本: {}\n", version));

        if let Err(e) = nvm_manager::ensure_node_version(version.clone()) {
            result_output.push_str(&format!("❌ 切换Node版本失败: {}\n", e));
            return Err(result_output);
        }
        result_output.push_str("✅ Node版本切换成功\n");
    }

    result_output.push_str("\n🚀 开始执行命令...\n\n");

    let mut cmd = platform::build_shell_command(&command);
    match cmd.current_dir(&working_dir).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            if !stdout.is_empty() {
                result_output.push_str("📤 标准输出:\n");
                result_output.push_str(&stdout);
                result_output.push_str("\n");
            }

            if !stderr.is_empty() {
                result_output.push_str("📤 错误输出:\n");
                result_output.push_str(&stderr);
                result_output.push_str("\n");
            }

            result_output.push_str(&format!("\n🔚 命令执行完成 (退出码: {})\n", output.status));

            if output.status.success() {
                result_output.push_str("✅ 命令执行成功\n");
                Ok(result_output)
            } else {
                result_output.push_str("❌ 命令执行失败\n");
                Err(result_output)
            }
        }
        Err(e) => {
            result_output.push_str(&format!("❌ 执行命令失败: {}\n", e));
            Err(result_output)
        }
    }
}

#[tauri::command]
async fn execute_project_command(
    command_id: String,
    working_dir: String,
    command: String,
    node_version: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_project_command_impl(command_id, working_dir, command, node_version)
    })
    .await
    .map_err(|error| format!("执行项目命令任务失败: {}", error))?
}

#[tauri::command]
async fn get_available_editors() -> Result<Vec<editor::Editor>, String> {
    tauri::async_runtime::spawn_blocking(editor::get_available_editors)
        .await
        .map_err(|error| format!("检测编辑器任务失败: {}", error))?
}

#[tauri::command]
async fn open_project_in_editor(editor_id: String, project_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editors = editor::get_available_editors()?;
        let editor = editors
            .iter()
            .find(|e| e.id == editor_id)
            .ok_or_else(|| format!("Editor not found: {}", editor_id))?;

        editor::open_project_in_editor(&editor.id, &editor.command, &project_path)
    })
    .await
    .map_err(|error| format!("打开编辑器任务失败: {}", error))?
}

#[tauri::command]
async fn open_in_finder(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || platform::open_path(&path))
        .await
        .map_err(|error| format!("打开路径任务失败: {}", error))?
}

#[tauri::command]
async fn build_execution_command(
    command: String,
    node_version: Option<String>,
    package_manager: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        modules::kitty::executor::build_execution_command(
            &command,
            node_version.as_deref(),
            &package_manager,
        )
    })
    .await
    .map_err(|error| format!("构建执行命令任务失败: {}", error))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(McpBuilder::default().build())
        .manage(tray::TrayState::default())
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .on_window_event(tray::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            greet,
            add_workspace,
            scan_workspace_projects,
            scan_project,
            get_nvm_status,
            ensure_node_version,
            switch_to_highest_version,
            execute_project_command,
            get_available_editors,
            open_project_in_editor,
            open_in_finder,
            build_execution_command,
            tray::sync_tray_projects,
            tray::set_tray_theme,
            modules::kitty::executor::execute_command_in_kitty,
            modules::kitty::executor::execute_command_with_kitten,
            modules::kitty::process::terminate_command,
            modules::kitty::process::get_running_processes,
            modules::git::list_branches,
            modules::git::switch_branch,
            modules::git::list_worktrees,
            modules::git::create_worktree,
            modules::git::remove_worktree,
            modules::terminal::pty_manager::create_terminal_session,
            modules::terminal::pty_manager::write_to_terminal,
            modules::terminal::pty_manager::resize_terminal,
            modules::terminal::pty_manager::close_terminal_session,
            modules::terminal::pty_manager::get_terminal_buffer,
            modules::terminal::pty_manager::ping_terminal_session,
            modules::codex::accounts::commands::codex_account_list,
            modules::codex::accounts::commands::codex_account_import_current,
            modules::codex::accounts::commands::codex_account_export_all,
            modules::codex::accounts::commands::codex_account_import_archive,
            modules::codex::accounts::commands::codex_account_sync_current,
            modules::codex::accounts::commands::codex_account_switch,
            modules::codex::accounts::commands::codex_account_switch_to_available,
            modules::codex::manager::commands::codex_start_session,
            modules::codex::manager::commands::codex_send_message,
            modules::codex::manager::commands::codex_approve_action,
            modules::codex::manager::commands::codex_stop_session,
            modules::agent::manager::commands::agent_get_settings,
            modules::agent::manager::commands::agent_save_settings,
            modules::agent::manager::commands::agent_get_mcp_config,
            modules::agent::manager::commands::agent_save_mcp_config,
            modules::agent::manager::commands::agent_start_session,
            modules::agent::manager::commands::agent_send_message,
            modules::agent::manager::commands::agent_approve_action,
            modules::agent::manager::commands::agent_stop_session,
            modules::file_system::read_dir,
            modules::window_manager::open_external_window,
            modules::window_manager::close_external_window,
            modules::window_manager::is_window_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
