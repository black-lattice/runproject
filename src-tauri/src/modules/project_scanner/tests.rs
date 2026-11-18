use super::*;

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
fn reads_node_metadata_only_for_direct_projects() {
    let root = std::env::temp_dir().join(format!("runproject-node-scan-{}", uuid::Uuid::new_v4()));
    let direct = root.join("service");
    let nested = direct.join("artifacts/releases/2");
    fs::create_dir_all(&nested).unwrap();
    fs::write(root.join("pnpm-lock.yaml"), "").unwrap();
    fs::write(root.join(".nvmrc"), "22\n").unwrap();
    fs::write(direct.join("package.json"), r#"{"name":"service"}"#).unwrap();
    fs::write(nested.join("package.json"), r#"{"name":"release"}"#).unwrap();

    let projects = scan_workspace(root.to_str().unwrap()).unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "service");
    assert_eq!(projects[0].package_manager, "pnpm");
    assert_eq!(projects[0].node_version.as_deref(), Some("22"));

    let single_project = scan_workspace(direct.to_str().unwrap()).unwrap();
    assert_eq!(single_project.len(), 1);
    assert_eq!(single_project[0].path, direct.to_str().unwrap());

    fs::remove_dir_all(root).unwrap();
}
