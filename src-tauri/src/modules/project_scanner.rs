use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub node_version: Option<String>,
    pub package_manager: String,
    pub commands: Vec<ProjectCommand>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommand {
    pub name: String,
    pub script: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub path: String,
    pub name: String,
    pub projects: Vec<Project>,
}

// 检测包管理器类型
pub fn detect_package_manager(dir: &Path) -> String {
    if dir.join("pnpm-lock.yaml").exists() {
        "pnpm".to_string()
    } else if dir.join("yarn.lock").exists() {
        "yarn".to_string()
    } else {
        "npm".to_string()
    }
}

// 检测Node版本
pub fn detect_node_version(dir: &Path) -> Option<String> {
    // 检查.nvmrc文件
    if let Ok(content) = fs::read_to_string(dir.join(".nvmrc")) {
        let version = content.trim();
        if !version.is_empty() {
            return Some(version.to_string());
        }
    }

    // 检查package.json中的engines字段
    if let Ok(content) = fs::read_to_string(dir.join("package.json")) {
        if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(engines) = package_json.get("engines").and_then(|e| e.get("node")) {
                if let Some(node_version) = engines.as_str() {
                    return Some(node_version.to_string());
                }
            }
        }
    }

    None
}

// 提取package.json中的scripts，保持原始顺序
pub fn extract_scripts(package_json_content: &str) -> Vec<ProjectCommand> {
    if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(package_json_content) {
        if let Some(scripts_value) = package_json.get("scripts") {
            // 使用Value::Object保持插入顺序
            if let Some(scripts_object) = scripts_value.as_object() {
                let mut commands = Vec::new();
                // 按插入顺序遍历scripts对象
                for (name, script) in scripts_object {
                    if let Some(script_value) = script.as_str() {
                        commands.push(ProjectCommand {
                            name: name.clone(),
                            script: script_value.to_string(),
                        });
                    }
                }
                return commands;
            }
        }
    }
    Vec::new()
}

// 扫描workspace目录下的所有项目
pub fn scan_workspace(workspace_path: &str) -> Result<Vec<Project>, String> {
    let workspace_dir = PathBuf::from(workspace_path);

    if !workspace_dir.exists() {
        return Err(format!("Workspace路径不存在: {}", workspace_path));
    }

    if !workspace_dir.is_dir() {
        return Err(format!("路径不是目录: {}", workspace_path));
    }

    let mut projects = Vec::new();

    // 扫描一级子目录
    if let Ok(entries) = fs::read_dir(workspace_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();

                // 只处理目录
                if path.is_dir() {
                    let package_json_path = path.join("package.json");

                    if package_json_path.exists() {
                        // 读取package.json
                        match fs::read_to_string(&package_json_path) {
                            Ok(content) => {
                                match serde_json::from_str::<serde_json::Value>(&content) {
                                    Ok(package_json) => {
                                        let name = package_json
                                            .get("name")
                                            .and_then(|n| n.as_str())
                                            .unwrap_or(path.file_name().unwrap().to_str().unwrap())
                                            .to_string();

                                        let node_version = detect_node_version(&path);
                                        let package_manager = detect_package_manager(&path);
                                        let commands = extract_scripts(&content);

                                        projects.push(Project {
                                            name,
                                            path: path.to_str().unwrap().to_string(),
                                            node_version,
                                            package_manager,
                                            commands,
                                        });
                                    }
                                    Err(_) => {
                                        eprintln!("无法解析package.json: {:?}", package_json_path);
                                    }
                                }
                            }
                            Err(_) => {
                                eprintln!("无法读取package.json: {:?}", package_json_path);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(projects)
}
