use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Editor {
    pub id: String,
    pub name: String,
    pub command: String,
    pub installed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditorList {
    pub editors: Vec<Editor>,
}

pub fn get_available_editors() -> Result<Vec<Editor>, String> {
    let mut editors = vec![
        Editor {
            id: "trae".to_string(),
            name: "Trae".to_string(),
            command: "trae".to_string(),
            installed: false,
        },
        Editor {
            id: "vscode".to_string(),
            name: "VSCode".to_string(),
            command: "code".to_string(),
            installed: false,
        },
        Editor {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            command: "cursor".to_string(),
            installed: false,
        },
        Editor {
            id: "webstorm".to_string(),
            name: "WebStorm".to_string(),
            command: "webstorm".to_string(),
            installed: false,
        },
        Editor {
            id: "intellij".to_string(),
            name: "IntelliJ IDEA".to_string(),
            command: "idea".to_string(),
            installed: false,
        },
        Editor {
            id: "sublime".to_string(),
            name: "Sublime Text".to_string(),
            command: "subl".to_string(),
            installed: false,
        },
        Editor {
            id: "atom".to_string(),
            name: "Atom".to_string(),
            command: "atom".to_string(),
            installed: false,
        },
    ];

    for editor in &mut editors {
        editor.installed = is_editor_installed(&editor.id, &editor.command);
    }

    Ok(editors)
}

fn augmented_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|p| env::split_paths(&p).collect())
        .unwrap_or_default();

    // Finder 启动的 .app 常见缺少这些路径
    for p in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        let pb = PathBuf::from(p);
        if !paths.contains(&pb) {
            paths.push(pb);
        }
    }

    paths
}

fn find_in_paths(command: &str, paths: &[PathBuf]) -> Option<PathBuf> {
    // 绝对路径/相对路径直接判定存在性
    if command.contains('/') {
        let p = PathBuf::from(command);
        if p.exists() {
            return Some(p);
        }
        return None;
    }

    for dir in paths {
        let candidate = dir.join(command);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn find_app_bundle_path(app_name: &str) -> Option<PathBuf> {
    let app_file = format!("{}.app", app_name);
    let home = env::var("HOME").unwrap_or_default();

    let dirs = [
        PathBuf::from("/Applications"),
        PathBuf::from(format!("{}/Applications", home)),
    ];

    // 精确路径优先
    for dir in &dirs {
        let p = dir.join(&app_file);
        if p.exists() {
            return Some(p);
        }
    }

    // 兜底：在常见目录里模糊匹配（例如 “Cursor Something.app”）
    let needle = app_name.to_lowercase();
    for dir in &dirs {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("app")) != Some(true) {
                continue;
            }
            let Some(fname) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let fname_lc = fname.to_lowercase();
            if fname_lc.contains(&needle) {
                return Some(p);
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn app_exists(app_name: &str) -> bool {
    find_app_bundle_path(app_name).is_some()
}

#[cfg(target_os = "macos")]
fn app_name_for_editor_id(editor_id: &str) -> Option<&'static str> {
    match editor_id {
        "cursor" => Some("Cursor"),
        "trae" => Some("Trae"),
        "vscode" => Some("Visual Studio Code"),
        "webstorm" => Some("WebStorm"),
        "intellij" => Some("IntelliJ IDEA"),
        "sublime" => Some("Sublime Text"),
        "atom" => Some("Atom"),
        _ => None,
    }
}

fn is_editor_installed(editor_id: &str, command: &str) -> bool {
    let paths = augmented_paths();
    if find_in_paths(command, &paths).is_some() {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(app_name) = app_name_for_editor_id(editor_id) {
            return app_exists(app_name);
        }
    }

    false
}

pub fn open_project_in_editor(
    editor_id: &str,
    editor_command: &str,
    project_path: &str,
) -> Result<String, String> {
    let paths = augmented_paths();
    if let Some(cmd_path) = find_in_paths(editor_command, &paths) {
        let output = Command::new(cmd_path)
            .arg(project_path)
            .output()
            .map_err(|e| format!("Failed to execute editor: {}", e))?;

        if output.status.success() {
            return Ok(format!("Opened project in {}", editor_command));
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to open project: {}", stderr));
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(app_name) = app_name_for_editor_id(editor_id) {
            let app_arg = find_app_bundle_path(app_name)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| app_name.to_string());

            let output = Command::new("open")
                .arg("-a")
                .arg(app_arg)
                .arg(project_path)
                .output()
                .map_err(|e| format!("Failed to open app: {}", e))?;

            if output.status.success() {
                return Ok(format!("Opened project in {}", app_name));
            }
        }
    }

    // 最后兜底：尝试直接执行（可能在运行时 PATH 已经被用户环境补齐）
    let output = Command::new(editor_command)
        .arg(project_path)
        .output()
        .map_err(|e| format!("Failed to execute editor: {}", e))?;

    if output.status.success() {
        Ok(format!("Opened project in {}", editor_command))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to open project: {}", stderr))
    }
}
