use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize)]
pub struct GitWorktree {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
    pub is_detached: bool,
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

#[tauri::command]
pub fn list_worktrees(project_path: String) -> Result<Vec<GitWorktree>, String> {
    ensure_git_repository(&project_path)?;

    let output = run_git_command(&["worktree", "list", "--porcelain"], &project_path)?;

    let mut worktrees = Vec::new();
    let mut current_worktree: Option<GitWorktree> = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            if let Some(wt) = current_worktree.take() {
                worktrees.push(wt);
            }
            let path = line.trim_start_matches("worktree ").to_string();
            current_worktree = Some(GitWorktree {
                path,
                branch: String::new(),
                is_main: false,
                is_detached: false,
            });
        } else if line.starts_with("HEAD ") {
            if let Some(ref mut wt) = current_worktree {
                wt.branch = line.trim_start_matches("HEAD ").to_string();
                wt.is_detached = true;
            }
        } else if line.starts_with("branch ") {
            if let Some(ref mut wt) = current_worktree {
                wt.branch = line
                    .trim_start_matches("branch ")
                    .trim_start_matches("refs/heads/")
                    .to_string();
                wt.is_detached = false;
            }
        }
    }

    if let Some(wt) = current_worktree {
        worktrees.push(wt);
    }

    if let Some(main) = worktrees.iter_mut().find(|w| w.path == project_path) {
        main.is_main = true;
    }

    Ok(worktrees)
}

#[tauri::command]
pub fn create_worktree(
    project_path: String,
    branch: String,
    worktree_path: String,
) -> Result<String, String> {
    ensure_git_repository(&project_path)?;

    if branch.trim().is_empty() {
        return Err("分支名称不能为空".to_string());
    }

    if worktree_path.trim().is_empty() {
        return Err("Worktree 路径不能为空".to_string());
    }

    match run_git_command(
        &["worktree", "add", worktree_path.trim(), branch.trim()],
        &project_path,
    ) {
        Ok(_) => Ok(format!(
            "已为分支 {} 创建 worktree: {}",
            branch, worktree_path
        )),
        Err(err) => Err(format!("创建 worktree 失败: {}", err)),
    }
}

#[tauri::command]
pub fn remove_worktree(project_path: String, worktree_path: String) -> Result<String, String> {
    ensure_git_repository(&project_path)?;

    if worktree_path.trim().is_empty() {
        return Err("Worktree 路径不能为空".to_string());
    }

    match run_git_command(&["worktree", "remove", worktree_path.trim()], &project_path) {
        Ok(_) => Ok(format!("已删除 worktree: {}", worktree_path)),
        Err(err) => Err(format!("删除 worktree 失败: {}", err)),
    }
}
