use std::path::{Path, PathBuf};

pub fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("workspace 不存在: {}", path.display()));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("workspace 无法解析: {}", e))?;
    Ok(canonical)
}

pub fn resolve_working_dir(workspace: &Path, requested: &Path) -> Result<PathBuf, String> {
    let resolved = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        workspace.join(requested)
    };
    let canonical = resolved
        .canonicalize()
        .map_err(|e| format!("工作目录无效: {}", e))?;

    if !canonical.starts_with(workspace) {
        return Err("工作目录超出 workspace 范围".to_string());
    }

    Ok(canonical)
}

pub fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}
