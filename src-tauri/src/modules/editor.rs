use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Editor {
    pub id: String,
    pub name: String,
    pub command: String,
    pub installed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditorList {
    pub editors: Vec<Editor>,
}

pub fn get_available_editors() -> Result<Vec<Editor>, String> {
    let mut editors = vec![
        Editor {
            id: "trae".to_string(),
            name: "Trae".to_string(),
            command: "trae".to_string(),
            installed: false,
        },
        Editor {
            id: "vscode".to_string(),
            name: "VSCode".to_string(),
            command: "code".to_string(),
            installed: false,
        },
        Editor {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            command: "cursor".to_string(),
            installed: false,
        },
        Editor {
            id: "webstorm".to_string(),
            name: "WebStorm".to_string(),
            command: "webstorm".to_string(),
            installed: false,
        },
        Editor {
            id: "intellij".to_string(),
            name: "IntelliJ IDEA".to_string(),
            command: "idea".to_string(),
            installed: false,
        },
        Editor {
            id: "sublime".to_string(),
            name: "Sublime Text".to_string(),
            command: "subl".to_string(),
            installed: false,
        },
        Editor {
            id: "atom".to_string(),
            name: "Atom".to_string(),
            command: "atom".to_string(),
            installed: false,
        },
    ];

    for editor in &mut editors {
        editor.installed = is_editor_installed(&editor.command);
    }

    Ok(editors)
}

fn is_editor_installed(command: &str) -> bool {
    Command::new("which")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn open_project_in_editor(editor_command: &str, project_path: &str) -> Result<String, String> {
    let output = Command::new(editor_command)
        .arg(project_path)
        .output()
        .map_err(|e| format!("Failed to execute editor: {}", e))?;

    if output.status.success() {
        Ok(format!("Opened project in {}", editor_command))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to open project: {}", stderr))
    }
}
