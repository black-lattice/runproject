use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

lazy_static::lazy_static! {
    static ref WEBVIEW_POS_CORRECTION: Mutex<HashMap<String, (i32, i32)>> =
        Mutex::new(HashMap::new());
}

#[derive(Clone, Serialize)]
struct BrowserUserClickPayload {
    label: String,
    url: String,
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
    if dx.abs() > 200 || dy.abs() > 200 {
        return;
    }
    let mut map = WEBVIEW_POS_CORRECTION.lock().unwrap();
    let (cur_dx, cur_dy) = map
        .get(label)
        .copied()
        .unwrap_or(DEFAULT_WEBVIEW_POS_CORRECTION);
    map.insert(label.to_string(), (cur_dx + dx, cur_dy + dy));
}

#[tauri::command]
pub fn create_child_webview(
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

    let init_script = r#"
        (function () {{
          try {{
            // 外部网站可能会调用 __TAURI__.opener.open_url（该 webview 通常无权限），避免 Unhandled Promise Rejection
            if (window.__TAURI__ && window.__TAURI__.opener) {{
              const opener = window.__TAURI__.opener;
              const nav = (u) => {{
                try {{ window.location.href = String(u); }} catch (_) {{}}
                return Promise.resolve();
              }};
              if (typeof opener.open_url === 'function') opener.open_url = nav;
              if (typeof opener.open === 'function') opener.open = nav;
            }}

            // 只处理 Bing 搜索页的“用户点击结果没反应”：
            // Bing 可能通过 JS preventDefault 后再 window.open/自定义跳转；在 child webview 中容易被拦截导致无反应。
            // 这里仅在 bing.com/search 下兜底：用户点链接就强制同页跳转，不影响其它站点。
            setTimeout(function () {{
              try {{
                const host = (window.location && window.location.hostname) || '';
                const path = (window.location && window.location.pathname) || '';
                if (!(host.endsWith('bing.com') && path === '/search')) return;

                // 兼容：站点走 window.open 分支时也能同页跳转
                try {{
                  const _open = window.open;
                  window.open = function (u) {{
                    try {{ if (u) window.location.href = String(u); }} catch (_) {{}}
                    return window;
                  }};
                  window.open.__runproject_wrapped__ = true;
                  window.open.__runproject_original__ = _open;
                }} catch (_) {{}}

                document.addEventListener('click', function (e) {{
                  try {{
                    let el = e.target;
                    while (el && el !== document.documentElement) {{
                      if (el.tagName && el.tagName.toLowerCase() === 'a') break;
                      el = el.parentElement;
                    }}
                    if (!el || !el.href) return;
                    const href = String(el.href);
                    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

                    // 只针对外跳链接，避免干扰 Bing 自身 UI 控件
                    const target = (el.getAttribute('target') || '').toLowerCase();
                    const rel = String(el.getAttribute('rel') || '');
                    const isBlank = target === '_blank' || rel.includes('noopener') || rel.includes('noreferrer');

                    // 站点往往会 preventDefault，我们直接兜底跳转
                    if (isBlank || e.defaultPrevented) {{
                      e.preventDefault();
                      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                      window.location.href = href;
                    }}
                  }} catch (_) {{}}
                }}, true);
              }} catch (_) {{}}
            }}, 0);
          }} catch (_) {{}}
        }})();
        "#
    .to_string();

    let app = window.app_handle().clone();
    let label_for_handler = label.clone();

    let webview_builder =
        tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed_url))
            // 使用更接近 macOS WKWebView 的 UA，避免 Bing 按 Chrome 路径下发导致渲染异常
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
            .initialization_script_for_all_frames(init_script)
            // 只响应“用户点击导致的新窗口请求”：改为同页导航，并通知前端（如需显示）一次点击 URL
            .on_new_window(move |url, _features| {
                let payload = BrowserUserClickPayload {
                    label: label_for_handler.clone(),
                    url: url.as_str().to_string(),
                };
                let _ = app.emit("browser:user-click", payload);

                if let Some(w) = app.get_webview(&label_for_handler) {
                    let url_for_nav = url.clone();
                    let w_for_nav = w.clone();
                    let _ = w.run_on_main_thread(move || {
                        let _ = w_for_nav.navigate(url_for_nav);
                    });
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

    if let (Ok(scale), Ok(actual_pos)) = (window.scale_factor(), webview.position()) {
        let actual = actual_pos.to_logical::<f64>(scale);
        let dx = x - actual.x.round() as i32;
        let dy = y - actual.y.round() as i32;
        update_pos_correction(&label, dx, dy);
    }

    Ok(label)
}

#[tauri::command]
pub fn navigate_webview(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
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
pub fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .close()
        .map_err(|e| format!("Failed to close webview: {}", e))
}

#[tauri::command]
pub fn hide_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .hide()
        .map_err(|e| format!("Failed to hide webview: {}", e))
}

#[tauri::command]
pub fn show_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview not found: {}", label))?;

    webview
        .show()
        .map_err(|e| format!("Failed to show webview: {}", e))
}

#[tauri::command]
pub fn resize_webview(
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

    let window = webview.window();
    if let (Ok(scale), Ok(actual_pos)) = (window.scale_factor(), webview.position()) {
        let actual = actual_pos.to_logical::<f64>(scale);
        let dx = x - actual.x.round() as i32;
        let dy = y - actual.y.round() as i32;
        update_pos_correction(&label, dx, dy);
    }

    Ok(())
}
