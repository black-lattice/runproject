#[cfg(target_os = "macos")]
extern "C" {
    fn rp_start_updater();
    fn rp_check_for_updates() -> bool;
}

#[cfg(target_os = "macos")]
pub fn start() {
    // RunEvent::Ready runs on the application's main event loop.
    unsafe { rp_start_updater() }
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(unsafe { rp_check_for_updates() });
        })
        .map_err(|error| error.to_string())?;
        if rx.await.map_err(|error| error.to_string())? {
            return Ok(());
        }
        Err("更新组件未加载，请从 GitHub Releases 安装完整的 macOS 版本。".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("当前平台不支持应用内更新".into())
    }
}
