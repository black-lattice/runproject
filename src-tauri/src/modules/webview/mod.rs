use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

lazy_static::lazy_static! {
    static ref WEBVIEW_POS_CORRECTION: Mutex<HashMap<String, (i32, i32)>> =
        Mutex::new(HashMap::new());
}

#[derive(Clone, Serialize)]
struct BrowserUrlChangedPayload {
    label: String,
    url: String,
}

#[cfg(target_os = "macos")]
const DEFAULT_WEBVIEW_POS_CORRECTION: (i32, i32) = (0, 0);
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

    let init_script = format!(
        r#"
        (function () {{
          try {{
            const WEBVIEW_LABEL = {label_json};

            function safeEmit(url) {{
              try {{
                const ev = window.__TAURI__ && window.__TAURI__.event;
                if (!ev || typeof ev.emit !== 'function') return;
                const payload = {{ label: WEBVIEW_LABEL, url: String(url) }};
                // 统一事件：用于地址栏显示更新
                ev.emit('browser:url-changed', payload);
                // 兼容旧事件名（若前端还在监听）
                ev.emit('browser:user-click', payload);
              }} catch (_) {{}}
            }}

            // 避免外部网站调用 opener.open_url 时因权限抛 Promise rejection
            if (window.__TAURI__ && window.__TAURI__.opener) {{
              const opener = window.__TAURI__.opener;
              const nav = (u) => {{
                try {{ window.location.href = String(u); }} catch (_) {{}}
                return Promise.resolve();
              }};
              if (typeof opener.open_url === 'function') opener.open_url = nav;
              if (typeof opener.open === 'function') opener.open = nav;
            }}

            // 1) window.open：常见于 target=_blank / 脚本打开
            try {{
              const _open = window.open;
              window.open = function (u) {{
                try {{
                  if (u) {{
                    safeEmit(u);
                    window.location.href = String(u);
                  }}
                }} catch (_) {{}}
                return window;
              }};
              window.open.__runproject_wrapped__ = true;
              window.open.__runproject_original__ = _open;
            }} catch (_) {{}}

            // 2) 点击 a[href]：覆盖常见的 preventDefault + 自定义跳转
            document.addEventListener('click', function (e) {{
              try {{
                if (e.button && e.button !== 0) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

                let el = e.target;
                while (el && el !== document.documentElement) {{
                  if (el.tagName && el.tagName.toLowerCase() === 'a') break;
                  el = el.parentElement;
                }}
                if (!el || !el.href) return;
                const href = String(el.href);
                if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

                const target = (el.getAttribute('target') || '').toLowerCase();
                const rel = String(el.getAttribute('rel') || '');
                const isBlank = target === '_blank' || rel.includes('noopener') || rel.includes('noreferrer');

                // 更新地址栏显示（只跟用户点击走）
                safeEmit(href);

                // 对“无反应”的常见情况兜底：新窗口倾向 or 已被 preventDefault
                if (isBlank || e.defaultPrevented) {{
                  e.preventDefault();
                  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                  window.location.href = href;
                }}
              }} catch (_) {{}}
            }}, true);

            // 3) 表单提交：GET/POST、target=_blank
            document.addEventListener('submit', function (e) {{
              try {{
                const form = e.target;
                if (!form || !form.action) return;
                const action = String(form.action);
                const method = String(form.method || 'get').toLowerCase();
                const target = String(form.target || '').toLowerCase();

                if (target === '_blank') {{
                  // 强制同页
                  form.target = '_self';
                }}

                if (method === 'get') {{
                  const fd = new FormData(form);
                  const params = new URLSearchParams();
                  for (const [k, v] of fd.entries()) {{
                    params.append(k, String(v));
                  }}
                  const url = action + (action.includes('?') ? '&' : '?') + params.toString();
                  safeEmit(url);
                }} else {{
                  safeEmit(action);
                }}
              }} catch (_) {{}}
            }}, true);

            // 4) SPA：history API / hash / popstate（只用于地址栏显示，不做强制跳转）
            (function () {{
              let last = '';
              let t = 0;
              function report() {{
                try {{
                  const now = String(window.location.href);
                  const ts = Date.now();
                  if (now === last) return;
                  if (ts - t < 300) return;
                  last = now;
                  t = ts;
                  safeEmit(now);
                }} catch (_) {{}}
              }}

              try {{
                const ps = history.pushState;
                history.pushState = function () {{
                  const r = ps.apply(this, arguments);
                  setTimeout(report, 0);
                  return r;
                }};
              }} catch (_) {{}}
              try {{
                const rs = history.replaceState;
                history.replaceState = function () {{
                  const r = rs.apply(this, arguments);
                  setTimeout(report, 0);
                  return r;
                }};
              }} catch (_) {{}}
              window.addEventListener('popstate', report, true);
              window.addEventListener('hashchange', report, true);
              // 兜底：少量轮询（不驱动导航）
              setInterval(report, 800);
            }})();

          }} catch (_) {{}}
        }})();
        "#,
        label_json = serde_json::to_string(&label).unwrap_or_else(|_| "\"\"".into())
    );

    let app = window.app_handle().clone();
    let label_for_handler = label.clone();

    let webview_builder =
        tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed_url))
            // 使用更接近 macOS WKWebView 的 UA，减少站点按 Chrome 特性路径下发导致异常
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
            .initialization_script_for_all_frames(init_script)
            // 新窗口请求：在当前 webview 内打开，并上报一次 URL（用于地址栏显示）
            .on_new_window(move |url, _features| {
                let payload = BrowserUrlChangedPayload {
                    label: label_for_handler.clone(),
                    url: url.as_str().to_string(),
                };
                let _ = app.emit("browser:url-changed", payload.clone());
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
