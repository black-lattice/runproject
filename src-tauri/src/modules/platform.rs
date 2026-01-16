use std::env;
use std::path::Path;
use std::process::Command;

pub fn build_shell_command(command: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell.exe");
        cmd.arg("-NoProfile").arg("-Command").arg(command);
        return cmd;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let default_shell = if cfg!(target_os = "macos") { "zsh" } else { "bash" };
        let shell_path = env::var("SHELL").unwrap_or_else(|_| default_shell.to_string());
        let shell_name = Path::new(&shell_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(default_shell);

        let mut cmd = Command::new(shell_path);
        if shell_name == "bash" || shell_name == "zsh" {
            cmd.arg("-lc");
        } else {
            cmd.arg("-c");
        }
        cmd.arg(command);
        return cmd;
    }
}

pub fn open_path(path: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(format!("Opened: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(format!("Opened: {}", path));
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(format!("Opened: {}", path));
    }
}
