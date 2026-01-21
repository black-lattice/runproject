use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_external_window(
    app: tauri::AppHandle,
    label: String,
    title: String,
    url: String,
) -> Result<(), String> {
    if app.get_webview_window(&label).is_some() {
        if let Some(window) = app.get_webview_window(&label) {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let parsed_url = url::Url::parse(&url).map_err(|e| e.to_string())?;

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url))
        .title(&title)
        .inner_size(1200.0, 800.0)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_external_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_window_open(app: tauri::AppHandle, label: String) -> bool {
    app.get_webview_window(&label).is_some()
}
