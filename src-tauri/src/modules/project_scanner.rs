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
    "vendor",
];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub node_version: Option<String>,
    pub package_manager: String,
    pub commands: Vec<ProjectCommand>,
    pub project_type: String,
    pub package_name: Option<String>,
    pub metadata_error: Option<String>,
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
    pub scan_mode: String,
}

fn read_project(path: &Path, workspace_root: &Path) -> Result<Project, String> {
    if !path.exists() {
        return Err(format!("项目路径不存在: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("项目路径不是目录: {}", path.display()));
    }

    let package_json_path = path.join("package.json");
    let is_node = package_json_path.is_file();
    let mut metadata_error = None;
    let content = if is_node {
        match fs::read_to_string(&package_json_path).and_then(|s| {
            serde_json::from_str::<serde_json::Value>(&s)
                .map(|_| s)
                .map_err(std::io::Error::other)
        }) {
            Ok(s) => Some(s),
            Err(e) => {
                metadata_error = Some(format!("package.json 无法读取或解析：{e}"));
                None
            }
        }
    } else {
        None
    };
    let package_name = content
        .as_ref()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .and_then(|v| v["name"].as_str().map(str::to_owned));
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_owned();

    Ok(Project {
        name,
        path: path.to_string_lossy().to_string(),
        node_version: if is_node {
            detect_node_version_within(path, workspace_root)
        } else {
            None
        },
        package_manager: if is_node {
            detect_package_manager_within(path, workspace_root)
        } else {
            String::new()
        },
        commands: content.as_deref().map(extract_scripts).unwrap_or_default(),
        project_type: detect_project_type(path).into(),
        package_name,
        metadata_error,
    })
}

fn detect_project_type(path: &Path) -> &'static str {
    for (marker, kind) in [
        ("package.json", "node"),
        ("Package.swift", "swift"),
        ("Cargo.toml", "rust"),
        ("go.mod", "go"),
        ("pyproject.toml", "python"),
        ("requirements.txt", "python"),
        ("CMakeLists.txt", "cmake"),
    ] {
        if path.join(marker).is_file() {
            return kind;
        }
    }
    for entry in fs::read_dir(path).into_iter().flatten().flatten() {
        match entry.path().extension().and_then(|s| s.to_str()) {
            Some("xcodeproj" | "xcworkspace") => return "swift",
            Some("sln" | "csproj") => return "dotnet",
            _ => (),
        }
    }
    "directory"
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
    if detect_project_type(current_dir) != "directory" || current_dir.join(".git").exists() {
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
    scan_workspace_with_mode(workspace_path, "folders")
}

pub fn scan_workspace_with_mode(workspace_path: &str, mode: &str) -> Result<Vec<Project>, String> {
    if !matches!(mode, "folders" | "recursive") {
        return Err("未知的扫描方式".into());
    }
    let workspace_dir = PathBuf::from(workspace_path);

    if !workspace_dir.exists() {
        return Err(format!("工作区路径不存在: {}", workspace_path));
    }
    if !workspace_dir.is_dir() {
        return Err(format!("路径不是目录: {}", workspace_path));
    }

    let mut projects = Vec::new();
    if mode == "recursive" {
        collect_projects(&workspace_dir, &workspace_dir, 0, &mut projects);
    } else if detect_project_type(&workspace_dir) != "directory" {
        // A user may select a project itself rather than its parent workspace.
        projects.push(read_project(&workspace_dir, &workspace_dir)?);
    } else {
        for entry in fs::read_dir(&workspace_dir).map_err(|e| format!("读取工作区失败：{e}"))?
        {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir()
                && !should_skip_directory(&entry.path())
            {
                projects.push(read_project(&entry.path(), &workspace_dir)?);
            }
        }
    }
    projects.sort_by(|left, right| {
        left.path
            .to_lowercase()
            .cmp(&right.path.to_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(projects)
}

pub fn scan_project(project_path: &str) -> Result<Project, String> {
    let path = PathBuf::from(project_path);
    read_project(&path, &path)
}

#[cfg(test)]
mod tests;
