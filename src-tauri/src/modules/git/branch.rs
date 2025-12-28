use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

fn ensure_git_repository(path: &str) -> Result<(), String> {
    if !Path::new(path).exists() {
        return Err(format!("项目路径不存在: {}", path));
    }

    if Path::new(path).join(".git").exists() {
        return Ok(());
    }

    match Command::new("git")
        .arg("rev-parse")
        .arg("--git-dir")
        .current_dir(path)
        .output()
    {
        Ok(output) if output.status.success() => Ok(()),
        Ok(_) => Err(format!("路径不是 Git 仓库: {}", path)),
        Err(err) => Err(format!("检查 Git 仓库失败: {}", err)),
    }
}

fn run_git_command(args: &[&str], working_dir: &str) -> Result<String, String> {
    match Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(err) => Err(format!("执行 git 命令失败: {}", err)),
    }
}

#[tauri::command]
pub fn list_branches(project_path: String) -> Result<Vec<GitBranch>, String> {
    ensure_git_repository(&project_path)?;

    let output = run_git_command(
        &[
            "for-each-ref",
            "--format=%(refname:short)::%(HEAD)",
            "refs/heads",
        ],
        &project_path,
    )?;

    let mut branches = Vec::new();

    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let mut parts = line.splitn(2, "::");
        let name = parts
            .next()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let head_flag = parts.next().unwrap_or("").trim();

        if name.is_empty() {
            continue;
        }

        branches.push(GitBranch {
            name,
            is_current: head_flag == "*",
        });
    }

    Ok(branches)
}

#[tauri::command]
pub fn switch_branch(project_path: String, branch: String) -> Result<String, String> {
    ensure_git_repository(&project_path)?;

    if branch.trim().is_empty() {
        return Err("分支名称不能为空".to_string());
    }

    match run_git_command(&["checkout", branch.trim()], &project_path) {
        Ok(_) => Ok(format!("已切换到分支 {}", branch)),
        Err(err) => Err(format!("切换分支失败: {}", err)),
    }
}
