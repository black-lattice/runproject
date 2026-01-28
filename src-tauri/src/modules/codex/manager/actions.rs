use std::fs;
use std::path::Path;
use super::utils::now_ms;

pub fn apply_patch(workspace: &Path, patch: &str) -> Result<(), String> {
    if patch.trim().is_empty() {
        return Err("patch 为空".to_string());
    }

    validate_patch_paths(patch)?;

    let temp_dir = std::env::temp_dir();
    let patch_path = temp_dir.join(format!("codex_patch_{}.diff", now_ms()));

    fs::write(&patch_path, patch).map_err(|e| format!("写入 patch 失败: {}", e))?;

    let git_result = std::process::Command::new("git")
        .arg("apply")
        .arg(&patch_path)
        .current_dir(workspace)
        .output();

    let applied = match git_result {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("DEBUG: git apply failed: {}", stderr.trim());
            false
        }
        Err(_) => false,
    };

    if !applied {
        let patch_result = std::process::Command::new("patch")
            .arg("-p0")
            .arg("-i")
            .arg(&patch_path)
            .current_dir(workspace)
            .output();

        match patch_result {
            Ok(output) if output.status.success() => {} // Ignore successful patch application
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("patch 应用失败: {}", stderr.trim()));
            }
            Err(e) => return Err(format!("patch 执行失败: {}", e)),
        }
    }

    let _ = fs::remove_file(&patch_path);
    Ok(())
}

fn validate_patch_paths(patch: &str) -> Result<(), String> {
    for line in patch.lines() {
        if let Some(path) = line.strip_prefix("+++ ").or_else(|| line.strip_prefix("--- ")) {
            let path = path.trim();
            if path.starts_with('/') || path.contains("..") {
                return Err(format!("patch 路径不安全: {}", path));
            }
            if path.contains(":\\") {
                return Err(format!("patch 路径不安全: {}", path));
            }
        }
    }
    Ok(())
}
