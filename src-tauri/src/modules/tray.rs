use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, Runtime, WindowEvent};

const TRAY_ID: &str = "main";
const SHOW_WINDOW_ID: &str = "tray:show-window";
const QUIT_ID: &str = "tray:quit";
const EMPTY_ID: &str = "tray:empty";
const OPEN_TERMINAL_ID: &str = "tray:open:terminal";
const OPEN_SETTINGS_ID: &str = "tray:open:settings";
const OPEN_FORMATTER_ID: &str = "tray:open:formatter";
const RUN_PREFIX: &str = "tray:run:";
const LOGO_DARK: &[u8] = include_bytes!("../../../src/assets/logo/moon-logo-dark-512.png");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayProjectCommand {
    pub name: String,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayProject {
    pub name: String,
    pub path: String,
    pub node_version: Option<String>,
    pub package_manager: String,
    pub commands: Vec<TrayProjectCommand>,
}

#[derive(Debug, Clone)]
struct TrayCommandAction {
    project_path: String,
    command_name: String,
}

#[derive(Default)]
pub struct TrayState {
    commands: Mutex<HashMap<String, TrayCommandAction>>,
}

#[tauri::command]
pub fn sync_tray_projects(
    app: AppHandle,
    state: tauri::State<TrayState>,
    projects: Vec<TrayProject>,
) -> Result<(), String> {
    let menu = build_projects_menu(&app, &state, &projects)?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "未找到菜单栏图标".to_string())?;

    tray.set_menu(Some(menu))
        .map_err(|error| format!("更新菜单栏项目菜单失败: {}", error))
}

#[tauri::command]
pub fn set_tray_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "未找到菜单栏图标".to_string())?;
    tray.set_icon(Some(logo_for_theme(&theme)?))
        .map_err(|error| format!("更新菜单栏图标失败: {}", error))
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_empty_menu(app.handle())?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(logo_for_theme("light")?)
        .icon_as_template(false)
        .tooltip("RunProject")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Err(error) = window.hide() {
            eprintln!("隐藏主窗口失败: {}", error);
        }
    }
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    match id {
        SHOW_WINDOW_ID => show_main_window(app),
        QUIT_ID => app.exit(0),
        OPEN_TERMINAL_ID => open_page(app, "terminal"),
        OPEN_SETTINGS_ID => open_page(app, "settings"),
        OPEN_FORMATTER_ID => open_page(app, "formatter"),
        _ if id.starts_with(RUN_PREFIX) => {
            let action = app
                .state::<TrayState>()
                .commands
                .lock()
                .ok()
                .and_then(|commands| commands.get(id).cloned());

            if let Some(action) = action {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = run_project_command(app, action) {
                        eprintln!("后台执行项目脚本失败: {}", error);
                    }
                });
            }
        }
        _ => {}
    }
}

fn logo_for_theme(_theme: &str) -> Result<Image<'static>, String> {
    Image::from_bytes(LOGO_DARK)
        .map(|image| image.to_owned())
        .map_err(|error| format!("读取 logo 图片失败: {}", error))
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.show() {
            eprintln!("显示主窗口失败: {}", error);
        }
        if let Err(error) = window.unminimize() {
            eprintln!("恢复主窗口失败: {}", error);
        }
        if let Err(error) = window.set_focus() {
            eprintln!("聚焦主窗口失败: {}", error);
        }
    }
}

fn open_page(app: &AppHandle, page: &str) {
    show_main_window(app);
    if let Err(error) = app.emit("tray-open-page", serde_json::json!({ "page": page })) {
        eprintln!("发送托盘页面跳转事件失败: {}", error);
    }
}

fn build_empty_menu<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    MenuBuilder::new(manager)
        .text(OPEN_TERMINAL_ID, "终端")
        .text(OPEN_SETTINGS_ID, "设置")
        .text(OPEN_FORMATTER_ID, "数据格式化")
        .separator()
        .text(EMPTY_ID, "暂无项目")
        .separator()
        .text(SHOW_WINDOW_ID, "显示主窗口")
        .text(QUIT_ID, "退出")
        .build()
}

fn build_projects_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &TrayState,
    projects: &[TrayProject],
) -> Result<Menu<R>, String> {
    let mut actions = HashMap::new();
    let mut menu_builder = MenuBuilder::new(app)
        .text(OPEN_TERMINAL_ID, "终端")
        .text(OPEN_SETTINGS_ID, "设置")
        .text(OPEN_FORMATTER_ID, "数据格式化")
        .separator();
    let mut action_index = 0usize;
    let mut has_projects = false;

    for project in projects {
        if project.commands.is_empty() {
            continue;
        }

        has_projects = true;
        let mut submenu = SubmenuBuilder::new(app, &project.name);

        for command in &project.commands {
            let item_id = format!("{}{}", RUN_PREFIX, action_index);
            action_index += 1;
            actions.insert(
                item_id.clone(),
                TrayCommandAction {
                    project_path: project.path.clone(),
                    command_name: command.name.clone(),
                },
            );
            submenu = submenu.text(item_id, &command.name);
        }

        let built = submenu
            .build()
            .map_err(|error| format!("创建项目菜单失败: {}", error))?;
        menu_builder = menu_builder.item(&built);
    }

    if !has_projects {
        menu_builder = menu_builder.text(EMPTY_ID, "暂无项目");
    }

    {
        let mut commands = state
            .commands
            .lock()
            .map_err(|_| "菜单命令状态锁定失败".to_string())?;
        *commands = actions;
    }

    menu_builder
        .separator()
        .text(SHOW_WINDOW_ID, "显示主窗口")
        .text(QUIT_ID, "退出")
        .build()
        .map_err(|error| format!("创建菜单栏菜单失败: {}", error))
}

fn run_project_command(app: AppHandle, action: TrayCommandAction) -> Result<(), String> {
    let db = crate::storage::database_path(&app)?;
    crate::modules::script_runner::RUNNER.start(
        &db,
        &action.project_path,
        &action.command_name,
        crate::modules::script_runner::app_sink(app),
    )?;
    Ok(())
}
