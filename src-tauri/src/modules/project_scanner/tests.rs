use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn default_import_matches_direct_folders_including_native_projects() {
    let root =
        std::env::temp_dir().join(format!("runproject-folder-scan-{}", uuid::Uuid::new_v4()));
    for path in [
        "MouseGesture",
        "ImageToolDemo/examples/web",
        "FastTab-React",
        "notes",
        "vendor/ignored",
        "node_modules/ignored",
        ".cache/ignored",
    ] {
        fs::create_dir_all(root.join(path)).unwrap();
    }
    fs::write(root.join("MouseGesture/Package.swift"), "// swift package").unwrap();
    fs::write(
        root.join("ImageToolDemo/examples/web/package.json"),
        r#"{"name":"nested-demo"}"#,
    )
    .unwrap();
    fs::write(
        root.join("FastTab-React/package.json"),
        r#"{"name":"fasttab-react","scripts":{"dev":"vite"}}"#,
    )
    .unwrap();
    let projects = scan_workspace(root.to_str().unwrap()).unwrap();
    let names: Vec<_> = projects.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(
        names,
        vec!["FastTab-React", "ImageToolDemo", "MouseGesture", "notes"]
    );
    assert_eq!(projects[0].commands[0].script, "vite");
    assert!(projects[2].commands.is_empty());
    assert!(projects[2].package_manager.is_empty());
    fs::remove_dir_all(root).unwrap();
}

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
    fs::create_dir_all(&nested).unwrap();
    for directory in ["node_modules", "vendor", "apps/web/vendor"] {
        let ignored = root.join(directory).join("ignored");
        fs::create_dir_all(&ignored).unwrap();
        fs::write(ignored.join("package.json"), r#"{"name":"ignored"}"#).unwrap();
    }
    fs::write(
        root.join("package.json"),
        r#"{"name":"root","packageManager":"pnpm@10.0.0"}"#,
    )
    .unwrap();
    fs::write(root.join(".nvmrc"), "22\n").unwrap();
    fs::write(nested.join("package.json"), r#"{"name":"web"}"#).unwrap();

    let projects = scan_workspace_with_mode(root.to_str().unwrap(), "recursive").unwrap();
    let names = projects
        .iter()
        .map(|project| project.name.as_str())
        .collect::<Vec<_>>();

    assert_eq!(names[1], "web");
    assert_eq!(projects.len(), 2);
    assert_eq!(projects[1].package_manager, "pnpm");
    assert_eq!(projects[1].node_version.as_deref(), Some("22"));

    fs::remove_dir_all(root).unwrap();
}
