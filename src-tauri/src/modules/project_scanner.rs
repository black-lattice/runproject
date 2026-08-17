use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_SCAN_DEPTH: usize = 6;
const IGNORED_DIRECTORIES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
];

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

fn read_project(path: &Path, workspace_root: &Path) -> Result<Project, String> {
    if !path.exists() {
        return Err(format!("项目路径不存在: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("项目路径不是目录: {}", path.display()));
    }

    let package_json_path = path.join("package.json");
    if !package_json_path.exists() {
        return Err(format!(
            "未找到 package.json: {}",
            package_json_path.display()
        ));
    }

    let content = fs::read_to_string(&package_json_path)
        .map_err(|error| format!("读取 package.json 失败: {}", error))?;
    let package_json = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("解析 package.json 失败: {}", error))?;

    let name = package_json
        .get("name")
        .and_then(|name| name.as_str())
        .unwrap_or(
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown"),
        )
        .to_string();

    Ok(Project {
        name,
        path: path.to_string_lossy().to_string(),
        node_version: detect_node_version_within(path, workspace_root),
        package_manager: detect_package_manager_within(path, workspace_root),
        commands: extract_scripts(&content),
    })
}

fn package_manager_in_dir(dir: &Path) -> Option<String> {
    if let Ok(content) = fs::read_to_string(dir.join("package.json")) {
        if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(value) = package_json
                .get("packageManager")
                .and_then(|value| value.as_str())
            {
                let name = value.split('@').next().unwrap_or_default();
                if matches!(name, "npm" | "pnpm" | "yarn") {
                    return Some(name.to_string());
                }
            }
        }
    }

    if dir.join("pnpm-lock.yaml").exists() {
        Some("pnpm".to_string())
    } else if dir.join("yarn.lock").exists() {
        Some("yarn".to_string())
    } else if dir.join("package-lock.json").exists() || dir.join("npm-shrinkwrap.json").exists() {
        Some("npm".to_string())
    } else {
        None
    }
}

fn visit_ancestors<T>(
    dir: &Path,
    boundary: &Path,
    detect: impl Fn(&Path) -> Option<T>,
) -> Option<T> {
    let mut current = Some(dir);

    while let Some(path) = current {
        if let Some(value) = detect(path) {
            return Some(value);
        }
        if path == boundary {
            break;
        }
        current = path.parent().filter(|parent| parent.starts_with(boundary));
    }

    None
}

fn detect_package_manager_within(dir: &Path, boundary: &Path) -> String {
    visit_ancestors(dir, boundary, package_manager_in_dir).unwrap_or_else(|| "npm".to_string())
}

fn node_version_in_dir(dir: &Path) -> Option<String> {
    for file_name in [".nvmrc", ".node-version"] {
        if let Ok(content) = fs::read_to_string(dir.join(file_name)) {
            let version = content.trim();
            if !version.is_empty() {
                return Some(version.to_string());
            }
        }
    }

    if let Ok(content) = fs::read_to_string(dir.join("package.json")) {
        if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(version) = package_json
                .get("volta")
                .and_then(|volta| volta.get("node"))
                .and_then(|version| version.as_str())
            {
                return Some(version.to_string());
            }

            if let Some(version) = package_json
                .get("engines")
                .and_then(|engines| engines.get("node"))
                .and_then(|version| version.as_str())
            {
                return Some(version.to_string());
            }
        }
    }

    None
}

fn detect_node_version_within(dir: &Path, boundary: &Path) -> Option<String> {
    visit_ancestors(dir, boundary, node_version_in_dir)
}

pub fn extract_scripts(package_json_content: &str) -> Vec<ProjectCommand> {
    if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(package_json_content) {
        if let Some(scripts) = package_json
            .get("scripts")
            .and_then(|value| value.as_object())
        {
            return scripts
                .iter()
                .filter_map(|(name, script)| {
                    script.as_str().map(|value| ProjectCommand {
                        name: name.clone(),
                        script: value.to_string(),
                    })
                })
                .collect();
        }
    }

    Vec::new()
}

fn should_skip_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') || IGNORED_DIRECTORIES.contains(&name))
        .unwrap_or(false)
}

fn collect_projects(
    current_dir: &Path,
    workspace_root: &Path,
    depth: usize,
    projects: &mut Vec<Project>,
) {
    if current_dir.join("package.json").is_file() {
        match read_project(current_dir, workspace_root) {
            Ok(project) => projects.push(project),
            Err(error) => eprintln!("读取项目失败 {:?}: {}", current_dir, error),
        }
    }

    if depth >= MAX_SCAN_DEPTH {
        return;
    }

    let mut directories = match fs::read_dir(current_dir) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
            .map(|entry| entry.path())
            .filter(|path| !should_skip_directory(path))
            .collect::<Vec<_>>(),
        Err(error) => {
            eprintln!("读取目录失败 {:?}: {}", current_dir, error);
            return;
        }
    };

    directories.sort();
    for directory in directories {
        collect_projects(&directory, workspace_root, depth + 1, projects);
    }
}

pub fn scan_workspace(workspace_path: &str) -> Result<Vec<Project>, String> {
    let workspace_dir = PathBuf::from(workspace_path);

    if !workspace_dir.exists() {
        return Err(format!("工作区路径不存在: {}", workspace_path));
    }
    if !workspace_dir.is_dir() {
        return Err(format!("路径不是目录: {}", workspace_path));
    }

    let mut projects = Vec::new();
    collect_projects(&workspace_dir, &workspace_dir, 0, &mut projects);
    projects.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(projects)
}

pub fn scan_project(project_path: &str) -> Result<Project, String> {
    let path = PathBuf::from(project_path);
    read_project(&path, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn scans_root_and_nested_projects_while_skipping_dependency_directories() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "runproject-scanner-{}-{}",
            std::process::id(),
            unique
        ));
        let nested = root.join("apps/web");
        let ignored = root.join("node_modules/ignored");

        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(&ignored).unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"name":"root","packageManager":"pnpm@10.0.0"}"#,
        )
        .unwrap();
        fs::write(root.join(".nvmrc"), "22\n").unwrap();
        fs::write(nested.join("package.json"), r#"{"name":"web"}"#).unwrap();
        fs::write(ignored.join("package.json"), r#"{"name":"ignored"}"#).unwrap();

        let projects = scan_workspace(root.to_str().unwrap()).unwrap();
        let names = projects
            .iter()
            .map(|project| project.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["root", "web"]);
        assert_eq!(projects[1].package_manager, "pnpm");
        assert_eq!(projects[1].node_version.as_deref(), Some("22"));

        fs::remove_dir_all(root).unwrap();
    }
}
