use super::context::ToolContext;
use super::paths::{resolve_existing_path, resolve_new_path};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

#[derive(Debug, Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
}

pub async fn read_file(ctx: &ToolContext, args: ReadFileArgs) -> Result<Value, String> {
    let path = resolve_existing_path(&ctx.workspace, &args.path)?;
    let content = fs::read_to_string(&path).map_err(|_| "读取文件失败".to_string())?;
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "content": content,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ListDirArgs {
    pub path: String,
}

pub async fn list_dir(ctx: &ToolContext, args: ListDirArgs) -> Result<Value, String> {
    let path = resolve_existing_path(&ctx.workspace, &args.path)?;
    let entries = fs::read_dir(&path).map_err(|_| "读取目录失败".to_string())?;
    let mut items = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            items.push(entry.path().to_string_lossy().to_string());
        }
    }
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "items": items,
    }))
}

#[derive(Debug, Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub overwrite: bool,
}

pub async fn write_file(ctx: &ToolContext, args: WriteFileArgs) -> Result<Value, String> {
    let content = args.content.unwrap_or_default();
    let approval = ctx
        .request_approval(
            "write",
            serde_json::json!({
                "path": args.path,
                "overwrite": args.overwrite,
            }),
        )
        .await?;
    if !approval {
        return Err("写入被拒绝".to_string());
    }

    let path = resolve_new_path(&ctx.workspace, &args.path)?;
    if path.exists() && !args.overwrite {
        return Err("文件已存在，未允许覆盖".to_string());
    }
    fs::write(&path, content.as_bytes()).map_err(|_| "写入文件失败".to_string())?;
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "bytes": content.as_bytes().len(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct DeletePathArgs {
    pub path: String,
}

pub async fn delete_path(ctx: &ToolContext, args: DeletePathArgs) -> Result<Value, String> {
    let approval = ctx
        .request_approval("delete", serde_json::json!({ "path": args.path }))
        .await?;
    if !approval {
        return Err("删除被拒绝".to_string());
    }

    let path = resolve_existing_path(&ctx.workspace, &args.path)?;
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|_| "删除目录失败".to_string())?;
    } else {
        fs::remove_file(&path).map_err(|_| "删除文件失败".to_string())?;
    }
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "deleted": true,
    }))
}

#[derive(Debug, Deserialize)]
pub struct MkdirArgs {
    pub path: String,
}

pub async fn mkdir(ctx: &ToolContext, args: MkdirArgs) -> Result<Value, String> {
    let approval = ctx
        .request_approval("mkdir", serde_json::json!({ "path": args.path }))
        .await?;
    if !approval {
        return Err("创建目录被拒绝".to_string());
    }

    let path = resolve_new_path(&ctx.workspace, &args.path)?;
    fs::create_dir_all(&path).map_err(|_| "创建目录失败".to_string())?;
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "created": true,
    }))
}

#[derive(Debug, Deserialize)]
pub struct MovePathArgs {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub overwrite: bool,
}

pub async fn move_path(ctx: &ToolContext, args: MovePathArgs) -> Result<Value, String> {
    let approval = ctx
        .request_approval(
            "move",
            serde_json::json!({
                "from": args.from,
                "to": args.to,
                "overwrite": args.overwrite,
            }),
        )
        .await?;
    if !approval {
        return Err("移动被拒绝".to_string());
    }

    let from_path = resolve_existing_path(&ctx.workspace, &args.from)?;
    let to_path = resolve_new_path(&ctx.workspace, &args.to)?;
    if to_path.exists() && !args.overwrite {
        return Err("目标已存在，未允许覆盖".to_string());
    }
    if to_path.exists() {
        if to_path.is_dir() {
            fs::remove_dir_all(&to_path).map_err(|_| "覆盖目录失败".to_string())?;
        } else {
            fs::remove_file(&to_path).map_err(|_| "覆盖文件失败".to_string())?;
        }
    }
    fs::rename(&from_path, &to_path).map_err(|_| "移动失败".to_string())?;

    Ok(serde_json::json!({
        "from": from_path.to_string_lossy(),
        "to": to_path.to_string_lossy(),
    }))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BatchAction {
    pub action: String,
    pub path: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub content: Option<String>,
    pub overwrite: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BatchArgs {
    pub actions: Vec<BatchAction>,
}

pub async fn batch_ops(ctx: &ToolContext, args: BatchArgs) -> Result<Value, String> {
    let approval = ctx
        .request_approval("batch", serde_json::json!({ "count": args.actions.len() }))
        .await?;
    if !approval {
        return Err("批量操作被拒绝".to_string());
    }

    let mut results = Vec::new();
    for action in args.actions {
        let result = match action.action.as_str() {
            "write" => {
                let path = action.path.ok_or_else(|| "缺少 path".to_string())?;
                let content = action.content.unwrap_or_default();
                let overwrite = action.overwrite.unwrap_or(false);
                let path_buf = resolve_new_path(&ctx.workspace, &path)?;
                if path_buf.exists() && !overwrite {
                    return Err("文件已存在".to_string());
                }
                fs::write(&path_buf, content.as_bytes()).map_err(|_| "批量写入失败".to_string())?;
                serde_json::json!({
                    "action": "write",
                    "path": path_buf.to_string_lossy(),
                })
            }
            "delete" => {
                let path = action.path.ok_or_else(|| "缺少 path".to_string())?;
                let path_buf = resolve_existing_path(&ctx.workspace, &path)?;
                if path_buf.is_dir() {
                    fs::remove_dir_all(&path_buf).map_err(|_| "批量删除目录失败".to_string())?;
                } else {
                    fs::remove_file(&path_buf).map_err(|_| "批量删除文件失败".to_string())?;
                }
                serde_json::json!({
                    "action": "delete",
                    "path": path_buf.to_string_lossy(),
                })
            }
            "mkdir" => {
                let path = action.path.ok_or_else(|| "缺少 path".to_string())?;
                let path_buf = resolve_new_path(&ctx.workspace, &path)?;
                fs::create_dir_all(&path_buf).map_err(|_| "批量创建目录失败".to_string())?;
                serde_json::json!({
                    "action": "mkdir",
                    "path": path_buf.to_string_lossy(),
                })
            }
            "move" => {
                let from = action.from.ok_or_else(|| "缺少 from".to_string())?;
                let to = action.to.ok_or_else(|| "缺少 to".to_string())?;
                let overwrite = action.overwrite.unwrap_or(false);
                let from_path = resolve_existing_path(&ctx.workspace, &from)?;
                let to_path = resolve_new_path(&ctx.workspace, &to)?;
                if to_path.exists() && !overwrite {
                    return Err("目标已存在".to_string());
                }
                if to_path.exists() {
                    if to_path.is_dir() {
                        fs::remove_dir_all(&to_path).map_err(|_| "覆盖目录失败".to_string())?;
                    } else {
                        fs::remove_file(&to_path).map_err(|_| "覆盖文件失败".to_string())?;
                    }
                }
                fs::rename(&from_path, &to_path).map_err(|_| "批量移动失败".to_string())?;
                serde_json::json!({
                    "action": "move",
                    "from": from_path.to_string_lossy(),
                    "to": to_path.to_string_lossy(),
                })
            }
            _ => {
                return Err("未知操作".to_string());
            }
        };
        results.push(result);
    }

    Ok(serde_json::json!({
        "results": results,
    }))
}
