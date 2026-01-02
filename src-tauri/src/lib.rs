use std::path::Path;

// 导入模块
mod modules;
use modules::editor;
use modules::nvm_manager;
use modules::project_scanner;
use tauri_plugin_mcp::Builder as McpBuilder;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

lazy_static::lazy_static! {
    static ref WEBVIEW_POS_CORRECTION: Mutex<HashMap<String, (i32, i32)>> = Mutex::new(HashMap::new());
}

#[cfg(target_os = "macos")]
const DEFAULT_WEBVIEW_POS_CORRECTION: (i32, i32) = (0, 28);
#[cfg(not(target_os = "macos"))]
const DEFAULT_WEBVIEW_POS_CORRECTION: (i32, i32) = (0, 0);

fn apply_pos_correction(label: &str, x: i32, y: i32) -> (i32, i32) {
    let map = WEBVIEW_POS_CORRECTION.lock().unwrap();
    let (dx, dy) = map
        .get(label)
        .copied()
        .unwrap_or(DEFAULT_WEBVIEW_POS_CORRECTION);
    (x + dx, y + dy)
}

fn update_pos_correction(label: &str, dx: i32, dy: i32) {
    // 防止异常值把位置带飞
    if dx.abs() > 200 || dy.abs() > 200 {
        return;
    }
    let mut map = WEBVIEW_POS_CORRECTION.lock().unwrap();
    // 以默认值为基线累加微调，避免第一次就出现大偏移时“校准无从开始”
    let (cur_dx, cur_dy) = map
        .get(label)
        .copied()
        .unwrap_or(DEFAULT_WEBVIEW_POS_CORRECTION);
    map.insert(label.to_string(), (cur_dx + dx, cur_dy + dy));
}

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

    match std::process::Command::new("bash")
        .arg("-c")
        .arg(&command)
        .current_dir(&working_dir)
        .output()
    {
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

    if !editor.installed {
        return Err(format!("Editor {} is not installed", editor.name));
    }

    editor::open_project_in_editor(&editor.command, &project_path)
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<String, String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(format!("Opened: {}", path))
}

#[tauri::command]
fn create_child_webview(
    window: tauri::Window,
    label: String,
    url: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let parsed_url = url
        .parse::<url::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let (x, y) = apply_pos_correction(&label, x, y);

    // 有些站点（如搜索/验证码）会通过 window.open 进行跳转；默认可能导致新窗口被拦截从而出现空白。
    // 这里将新窗口请求转为在当前 child webview 内导航，并阻止创建新窗口。
    let app = window.app_handle().clone();
    let label_for_handler = label.clone();
    let webview_builder =
        tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed_url))
            .on_new_window(move |url, _features| {
                if let Some(webview) = app.get_webview(&label_for_handler) {
                    let _ = webview.navigate(url);
                }
                tauri::webview::NewWindowResponse::Deny
            });

    let webview = window
        .add_child(
            webview_builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| format!("Failed to create child webview: {}", e))?;

    // 位置自校准：读取实际 position，与期望值比较，记录偏差用于后续修正
    if let (Ok(scale), Ok(actual_pos)) = (window.scale_factor(), webview.position()) {
        let actual = actual_pos.to_logical::<f64>(scale);
        let dx = x - actual.x.round() as i32;
        let dy = y - actual.y.round() as i32;
        update_pos_correction(&label, dx, dy);
    }

    Ok(label)
}

#[tauri::command]
fn navigate_webview(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    let parsed_url = url
        .parse::<url::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    webview
        .navigate(parsed_url)
        .map_err(|e| format!("Failed to navigate: {}", e))
}

#[tauri::command]
fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .close()
        .map_err(|e| format!("Failed to close webview: {}", e))
}

#[tauri::command]
fn hide_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .hide()
        .map_err(|e| format!("Failed to hide webview: {}", e))
}

#[tauri::command]
fn show_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .show()
        .map_err(|e| format!("Failed to show webview: {}", e))
}

#[tauri::command]
fn resize_webview(
    app: tauri::AppHandle,
    label: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    let (x, y) = apply_pos_correction(&label, x, y);

    webview
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;

    webview
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;

    // 位置自校准：读取实际 position，与期望值比较，记录偏差用于后续修正
    let window = webview.window();
    if let (Ok(scale), Ok(actual_pos)) = (window.scale_factor(), webview.position()) {
        let actual = actual_pos.to_logical::<f64>(scale);
        let dx = x - actual.x.round() as i32;
        let dy = y - actual.y.round() as i32;
        update_pos_correction(&label, dx, dy);
    }

    Ok(())
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
            create_child_webview,
            navigate_webview,
            close_webview,
            hide_webview,
            show_webview,
            resize_webview,
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
            modules::terminal::pty_manager::get_terminal_buffer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
