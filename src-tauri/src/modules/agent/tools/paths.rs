use std::path::{Path, PathBuf};

pub fn resolve_existing_path(workspace: &Path, input: &str) -> Result<PathBuf, String> {
    let workspace_canon = workspace
        .canonicalize()
        .map_err(|_| "无法解析工作目录".to_string())?;
    let candidate = if Path::new(input).is_absolute() {
        PathBuf::from(input)
    } else {
        workspace_canon.join(input)
    };

    let canon = candidate
        .canonicalize()
        .map_err(|_| "路径不存在或无法解析".to_string())?;

    if !canon.starts_with(&workspace_canon) {
        return Err("路径超出工作目录范围".to_string());
    }

    Ok(canon)
}

pub fn resolve_new_path(workspace: &Path, input: &str) -> Result<PathBuf, String> {
    let workspace_canon = workspace
        .canonicalize()
        .map_err(|_| "无法解析工作目录".to_string())?;
    let candidate = if Path::new(input).is_absolute() {
        PathBuf::from(input)
    } else {
        workspace_canon.join(input)
    };

    let parent = candidate
        .parent()
        .ok_or_else(|| "父目录无效".to_string())?;
    let parent_canon = parent
        .canonicalize()
        .map_err(|_| "父目录不存在".to_string())?;

    if !parent_canon.starts_with(&workspace_canon) {
        return Err("路径超出工作目录范围".to_string());
    }

    Ok(candidate)
}
