use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFile {
    pub id: String,
    pub title: String,
    pub path: String,
}

fn is_md_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn file_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled")
        .to_string()
}

fn title_from_content(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        if let Some(title) = line.strip_prefix("# ") {
            return Some(title.trim().to_string());
        }
    }
    None
}

fn title_from_filename(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled")
        .replace(['-', '_'], " ")
        .trim()
        .to_string()
}

#[tauri::command]
pub fn list_md_files(folder_path: String) -> Result<Vec<KnowledgeFile>, String> {
    let dir = PathBuf::from(&folder_path);
    if !dir.exists() || !dir.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文件失败: {}", e))?;
        let path = entry.path();
        if !path.is_file() || !is_md_file(&path) {
            continue;
        }

        let title = title_from_content(&path).unwrap_or_else(|| title_from_filename(&path));
        files.push(KnowledgeFile {
            id: file_id_from_path(&path),
            title,
            path: path.to_string_lossy().to_string(),
        });
    }

    files.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(files)
}

#[tauri::command]
pub fn read_md_file(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() || !file_path.is_file() || !is_md_file(&file_path) {
        return Err("文件不存在或不是 Markdown".to_string());
    }
    fs::read_to_string(&file_path).map_err(|e| format!("读取失败: {}", e))
}

#[tauri::command]
pub fn write_md_file(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() || !file_path.is_file() || !is_md_file(&file_path) {
        return Err("文件不存在或不是 Markdown".to_string());
    }
    fs::write(&file_path, content).map_err(|e| format!("写入失败: {}", e))
}
