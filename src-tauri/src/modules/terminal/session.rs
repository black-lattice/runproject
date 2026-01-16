use portable_pty::{CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::{env, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
}

pub struct TerminalSession {
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send>>>>,
    pub buffer: Arc<Mutex<Vec<u8>>>,
}

impl TerminalSession {
    pub fn new(config: TerminalConfig) -> Result<Self, String> {
        let pty_system = portable_pty::native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: config.rows,
                cols: config.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("创建 PTY 失败: {}", e))?;

        let mut cmd = build_shell_command()?;
        cmd.cwd(&config.cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LANG", "en_US.UTF-8");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动 shell 失败: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("获取 writer 失败: {}", e))?;

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(Some(child))),
            buffer: Arc::new(Mutex::new(Vec::new())),
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        writer
            .write_all(data)
            .map_err(|e| format!("写入失败: {}", e))?;
        writer.flush().map_err(|e| format!("刷新失败: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self
            .master
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("调整大小失败: {}", e))?;
        Ok(())
    }

    pub fn terminate(&self) -> Result<(), String> {
        let mut child_guard = self
            .child
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(mut child) = child_guard.take() {
            child.kill().map_err(|e| format!("终止失败: {}", e))?;
        }

        Ok(())
    }
}

fn build_shell_command() -> Result<CommandBuilder, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.arg("-NoLogo");
        cmd.arg("-NoExit");
        cmd.arg("-Command");
        cmd.arg(
            "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); \
             [Console]::InputEncoding = [System.Text.UTF8Encoding]::new();",
        );
        return Ok(cmd);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let default_shell = if cfg!(target_os = "macos") { "zsh" } else { "bash" };
        let shell = env::var("SHELL").unwrap_or_else(|_| default_shell.to_string());
        let shell_name = Path::new(&shell)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(default_shell);

        let mut cmd = CommandBuilder::new(&shell);
        if shell_name == "zsh" || shell_name == "bash" {
            cmd.arg("-l");
        }
        return Ok(cmd);
    }
}
