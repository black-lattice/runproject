use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, LogicalSize, Manager, PhysicalPosition, Runtime, WindowEvent};

const TRAY_ID: &str = "main";
const PANEL_ID: &str = "tray-panel";
#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../../icons/tray-template.png");
#[cfg(not(target_os = "macos"))]
const TRAY_ICON: &[u8] = include_bytes!("../../icons/32x32.png");

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_ICON)?.to_owned())
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("RunProject")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                position,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                match button {
                    MouseButton::Right => {
                        if let Err(error) = toggle_panel(app, position, rect) {
                            eprintln!("打开菜单栏面板失败: {}", error);
                        }
                    }
                    MouseButton::Left => show_main_window(app),
                    _ => {}
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn toggle_panel(
    app: &AppHandle,
    position: PhysicalPosition<f64>,
    rect: tauri::Rect,
) -> tauri::Result<()> {
    let Some(panel) = app.get_webview_window(PANEL_ID) else {
        return Ok(());
    };
    if panel.is_visible()? {
        return panel.hide();
    }
    // Tray event coordinates and monitor work areas are physical pixels.
    let monitors = panel.available_monitors()?;
    let monitor = monitors.iter().find(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        position.x >= origin.x as f64
            && position.x < origin.x as f64 + size.width as f64
            && position.y >= origin.y as f64
            && position.y < origin.y as f64 + size.height as f64
    });
    let scale = monitor
        .map(|m| m.scale_factor())
        .unwrap_or(panel.scale_factor()?);
    let anchor = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);
    let (mut width, mut height) = (400.0 * scale, 480.0 * scale);
    let mut x = anchor.x + icon_size.width / 2.0 - width / 2.0;
    let mut y = anchor.y + icon_size.height + 6.0 * scale;
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        width = width.min(area.size.width as f64);
        height = height.min(area.size.height as f64);
        x = x.clamp(
            area.position.x as f64,
            area.position.x as f64 + area.size.width as f64 - width,
        );
        y = y.clamp(
            area.position.y as f64,
            area.position.y as f64 + area.size.height as f64 - height,
        );
    }
    panel.set_size(LogicalSize::new(width / scale, height / scale))?;
    panel.set_position(panel_position(x, y, scale))?;
    panel.show()?;
    panel.set_focus()
}

// On macOS Tao converts physical positions using the window's CURRENT screen
// scale, which may differ from the tray's screen while the panel is hidden.
// Passing logical screen coordinates avoids applying that scale a second time.
fn panel_position(x: f64, y: f64, target_scale: f64) -> tauri::Position {
    #[cfg(target_os = "macos")]
    {
        tauri::LogicalPosition::new(x / target_scale, y / target_scale).into()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = target_scale;
        PhysicalPosition::new(x.round() as i32, y.round() as i32).into()
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::panel_position;

    #[test]
    fn retina_tray_position_does_not_use_the_hidden_windows_scale() {
        let position = panel_position(2020.0, 72.0, 2.0);
        for current_scale in [1.0, 2.0] {
            let logical = position.to_logical::<f64>(current_scale);
            assert_eq!((logical.x, logical.y), (1010.0, 36.0));
        }
    }

    #[test]
    fn external_screen_keeps_negative_coordinates_when_leaving_retina() {
        let logical = panel_position(-1500.0, 36.0, 1.0).to_logical::<f64>(2.0);
        assert_eq!((logical.x, logical.y), (-1500.0, 36.0));
    }
}

#[tauri::command]
pub fn tray_panel_action(app: AppHandle, action: String) -> Result<(), String> {
    match action.as_str() {
        "show" => show_main_window(&app),
        "quit" => app.exit(0),
        "hide" => {}
        _ => return Err("不支持的面板操作".into()),
    }
    if let Some(panel) = app.get_webview_window(PANEL_ID) {
        panel.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if matches!(event, WindowEvent::Focused(false)) && window.label() == PANEL_ID {
        let _ = window.hide();
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Err(error) = window.hide() {
            eprintln!("隐藏窗口失败: {}", error);
        }
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())
        {
            eprintln!("显示主窗口失败: {}", error);
        }
    }
}
