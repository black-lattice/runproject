use std::process::Command;

pub fn is_mcp_server(cli_args: &[String]) -> bool {
    cli_args.iter().any(|arg| arg == "mcp-server")
        || (cli_args.len() >= 2 && cli_args[0] == "mcp" && cli_args[1] == "serve")
}

pub fn detect_mcp_args(cli_path: &str) -> Vec<String> {
    if let Some(version) = detect_codex_version(cli_path) {
        if version >= (0, 40, 0) {
            println!("DEBUG: Detected newer codex version, using 'mcp-server'");
            return vec!["mcp-server".to_string()];
        }
        println!("DEBUG: Detected older codex version, using 'mcp serve'");
        return vec!["mcp".to_string(), "serve".to_string()];
    }
    println!("DEBUG: Failed to detect version, defaulting to 'mcp-server'");
    vec!["mcp-server".to_string()]
}

pub fn detect_codex_version(cli_path: &str) -> Option<(u32, u32, u32)> {
    println!("DEBUG: Detecting codex version for: {}", cli_path);
    let output = Command::new(cli_path).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    println!("DEBUG: Codex version output: {}", text);
    for token in text.split_whitespace() {
        let cleaned = token
            .trim_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .to_string();
        if let Some(version) = parse_version(&cleaned) {
            return Some(version);
        }
    }
    None
}

fn parse_version(input: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = input.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].parse::<u32>().ok()?;
    Some((major, minor, patch))
}
