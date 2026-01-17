use std::path::Path;

// 导入模块
mod modules;
use modules::editor;
use modules::knowledge;
use modules::nvm_manager;
use modules::platform;
use modules::project_scanner;
use tauri_plugin_mcp::Builder as McpBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn add_workspace(path: String) -> Result<project_scanner::Workspace, String> {
    let workspace_name = Path::new(&path)
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    let projects = project_scanner::scan_workspace(&path)?;

    Ok(project_scanner::Workspace {
        path,
        name: workspace_name,
        projects,
    })
}

#[tauri::command]
fn scan_workspace_projects(
    workspace_path: String,
) -> Result<Vec<project_scanner::Project>, String> {
    project_scanner::scan_workspace(&workspace_path)
}

#[tauri::command]
fn get_nvm_status() -> Result<serde_json::Value, String> {
    nvm_manager::get_nvm_status()
}

#[tauri::command]
fn ensure_node_version(version: String) -> Result<String, String> {
    nvm_manager::ensure_node_version(version)
}

#[tauri::command]
fn switch_to_highest_version(versions: Vec<String>) -> Result<String, String> {
    nvm_manager::switch_to_highest_version(versions)
}

#[tauri::command]
fn execute_project_command(
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
fn get_available_editors() -> Result<Vec<editor::Editor>, String> {
    editor::get_available_editors()
}

#[tauri::command]
fn open_project_in_editor(editor_id: String, project_path: String) -> Result<String, String> {
    let editors = editor::get_available_editors()?;
    let editor = editors
        .iter()
        .find(|e| e.id == editor_id)
        .ok_or_else(|| format!("Editor not found: {}", editor_id))?;

    editor::open_project_in_editor(&editor.id, &editor.command, &project_path)
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<String, String> {
    platform::open_path(&path)
}

#[tauri::command]
fn build_execution_command(
    command: String,
    node_version: Option<String>,
    package_manager: String,
) -> Result<String, String> {
    modules::kitty::executor::build_execution_command(
        &command,
        node_version.as_deref(),
        &package_manager,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(McpBuilder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            add_workspace,
            scan_workspace_projects,
            get_nvm_status,
            ensure_node_version,
            switch_to_highest_version,
            execute_project_command,
            get_available_editors,
            open_project_in_editor,
            open_in_finder,
            build_execution_command,
            modules::webview::create_child_webview,
            modules::webview::navigate_webview,
            modules::webview::close_webview,
            modules::webview::hide_webview,
            modules::webview::show_webview,
            modules::webview::resize_webview,
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
            modules::knowledge::list_md_files,
            modules::knowledge::read_md_file,
            modules::knowledge::write_md_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
