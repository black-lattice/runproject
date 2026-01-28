use std::path::{Path, PathBuf};

pub fn validate_workspace(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.exists() { return Err(format!("工作目录不存在: {}", path.display())); }
    let canonical = path.canonicalize().map_err(|e| format!("工作目录无法解析: {}", e))?;
    Ok(canonical)
}
