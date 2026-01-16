use std::process::{Command, Output, Stdio};

#[derive(Clone, Copy)]
enum NodeVersionManager {
    Nvm,
    Fnm,
    NvmWindows,
}

impl NodeVersionManager {
    fn label(&self) -> &'static str {
        match self {
            NodeVersionManager::Nvm => "nvm",
            NodeVersionManager::Fnm => "fnm",
            NodeVersionManager::NvmWindows => "nvm-windows",
        }
    }
}

fn run_command(mut command: Command) -> Result<Output, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    if output.status.success() {
        Ok(output)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("命令执行错误: {}", error))
    }
}

fn execute_manager_command(manager: NodeVersionManager, args: &[&str]) -> Result<Output, String> {
    match manager {
        NodeVersionManager::Nvm => {
            let script = format!("source ~/.nvm/nvm.sh && nvm {}", args.join(" "));
            let mut command = Command::new("bash");
            command.arg("-c").arg(script);
            run_command(command)
        }
        NodeVersionManager::Fnm => {
            let mut command = Command::new("fnm");
            command.args(args);
            run_command(command)
        }
        NodeVersionManager::NvmWindows => {
            let mut command = Command::new("nvm");
            command.args(args);
            run_command(command)
        }
    }
}

fn is_nvm_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("nvm");
        command.arg("version");
        return run_command(command).is_ok();
    }

    let mut command = Command::new("bash");
    command
        .arg("-c")
        .arg("source ~/.nvm/nvm.sh && nvm --version");
    run_command(command).is_ok()
}

fn is_fnm_available() -> bool {
    let mut command = Command::new("fnm");
    command.arg("--version");
    run_command(command).is_ok()
}

fn detect_manager() -> Result<NodeVersionManager, String> {
    #[cfg(target_os = "windows")]
    {
        if is_nvm_available() {
            return Ok(NodeVersionManager::NvmWindows);
        }
        if is_fnm_available() {
            return Ok(NodeVersionManager::Fnm);
        }
        return Err("未检测到可用的 Node 版本管理器 (nvm 或 fnm)".to_string());
    }

    if is_nvm_available() {
        Ok(NodeVersionManager::Nvm)
    } else if is_fnm_available() {
        Ok(NodeVersionManager::Fnm)
    } else {
        Err("未检测到可用的 Node 版本管理器 (nvm 或 fnm)".to_string())
    }
}

fn normalize_version_token(token: &str) -> Option<String> {
    let trimmed = token.trim_matches(|c: char| !(c.is_ascii_digit() || c == 'v' || c == '.'));

    if !trimmed.is_empty()
        && trimmed
            .chars()
            .next()
            .map(|c| c.is_ascii_digit())
            .unwrap_or(false)
    {
        return Some(trimmed.to_string());
    }

    if let Some(pos) = token.find('v') {
        let candidate = &token[pos..];
        let trimmed =
            candidate.trim_matches(|c: char| !(c.is_ascii_digit() || c == 'v' || c == '.'));

        if trimmed.starts_with('v')
            && trimmed
                .chars()
                .nth(1)
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
        {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn parse_versions(output: &str) -> Vec<String> {
    let mut versions: Vec<String> = output
        .lines()
        .filter_map(|line| {
            line.split_whitespace()
                .find_map(|token| normalize_version_token(token))
        })
        .collect();

    versions.sort();
    versions.dedup();
    versions
}

fn get_installed_versions_with(manager: NodeVersionManager) -> Result<Vec<String>, String> {
    let args: Vec<&str> = match manager {
        NodeVersionManager::Nvm => vec!["list", "--no-colors"],
        NodeVersionManager::Fnm => vec!["list"],
        NodeVersionManager::NvmWindows => vec!["list"],
    };

    let output = execute_manager_command(manager, &args)?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    Ok(parse_versions(&stdout))
}

fn install_node_version_with(manager: NodeVersionManager, version: &str) -> Result<String, String> {
    let output = execute_manager_command(manager, &["install", version])?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn use_node_version_with(manager: NodeVersionManager, version: &str) -> Result<String, String> {
    let args: Vec<&str> = match manager {
        NodeVersionManager::Nvm => vec!["use", version],
        NodeVersionManager::Fnm => vec!["default", version],
        NodeVersionManager::NvmWindows => vec!["use", version],
    };

    let output = execute_manager_command(manager, &args)?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn ensure_with_manager(manager: NodeVersionManager, version: &str) -> Result<String, String> {
    let installed_versions = get_installed_versions_with(manager)?;

    if !installed_versions.iter().any(|item| item == version) {
        install_node_version_with(manager, version)?;
    }

    use_node_version_with(manager, version)?;
    Ok(format!(
        "成功切换到Node {} (使用{})",
        version,
        manager.label()
    ))
}

// 获取最高的Node版本
fn get_highest_version(versions: &[String]) -> Option<String> {
    if versions.is_empty() {
        return None;
    }

    let mut highest = versions[0].clone();
    for version in versions {
        if version > &highest {
            highest = version.clone();
        }
    }

    Some(highest)
}

// 获取NVM状态
pub fn get_nvm_status() -> Result<serde_json::Value, String> {
    match detect_manager() {
        Ok(manager) => {
            let installed_versions = get_installed_versions_with(manager)?;
            Ok(serde_json::json!({
                "available": true,
                "manager": manager.label(),
                "installed_versions": installed_versions
            }))
        }
        Err(_) => Ok(serde_json::json!({
            "available": false,
            "manager": "unknown",
            "installed_versions": Vec::<String>::new()
        })),
    }
}

// 确保Node版本可用
pub fn ensure_node_version(version: String) -> Result<String, String> {
    let manager = detect_manager()?;
    ensure_with_manager(manager, &version)
}

// 切换到最高版本
pub fn switch_to_highest_version(versions: Vec<String>) -> Result<String, String> {
    let manager = detect_manager()?;

    if let Some(highest) = get_highest_version(&versions) {
        ensure_with_manager(manager, &highest).map(|_| format!("已切换到最高版本: {}", highest))
    } else {
        Err("没有找到可用的Node版本".to_string())
    }
}

// 根据可用的 Node 版本管理器构建命令前缀
pub fn wrap_command_with_node(version: &str, command: &str) -> Result<String, String> {
    let manager = detect_manager()?;
    let wrapped = match manager {
        NodeVersionManager::Nvm => {
            format!("source ~/.nvm/nvm.sh && nvm use {} && {}", version, command)
        }
        NodeVersionManager::Fnm => format!(
            "eval \"$(fnm env --shell=bash)\" && fnm use {} && {}",
            version, command
        ),
        NodeVersionManager::NvmWindows => format!(
            "nvm use {}; if ($LASTEXITCODE -ne 0) {{ exit $LASTEXITCODE }}; {}",
            version, command
        ),
    };

    Ok(wrapped)
}
