use crate::{modules::script_runner::ScriptRun, storage};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const WINDOW_MS: u64 = 30 * 24 * 60 * 60 * 1000;
fn cutoff(now: u64) -> u64 {
    now.saturating_sub(WINDOW_MS)
}

fn initialize(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS command_launches (
        run_id TEXT PRIMARY KEY NOT NULL,
        project_path TEXT NOT NULL,
        command_name TEXT NOT NULL,
        started_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS command_launches_started ON command_launches(started_at);",
    )
    .map_err(|error| error.to_string())
}

fn insert(db: &mut Connection, run: &ScriptRun) -> Result<(), String> {
    initialize(db)?;
    let tx = db.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT OR IGNORE INTO command_launches VALUES (?1, ?2, ?3, ?4)",
        params![
            run.id,
            run.project["path"].as_str().ok_or("缺少项目路径")?,
            run.command["name"].as_str().ok_or("缺少命令名")?,
            run.started_at
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM command_launches WHERE started_at < ?1",
        [cutoff(run.started_at)],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

// Analytics must never turn a successfully launched process into a failed request.
pub(crate) fn record(database: &Path, run: &ScriptRun) {
    let result = storage::open_database_path(database).and_then(|mut db| insert(&mut db, run));
    if let Err(error) = result {
        eprintln!("保存命令使用统计失败: {error}");
    }
}

fn read(db: &Connection, now: u64) -> Result<Vec<Value>, String> {
    initialize(db)?;
    let mut statement = db
        .prepare(
            "SELECT project_path, command_name, COUNT(*), MAX(started_at)
        FROM command_launches WHERE started_at >= ?1 GROUP BY project_path, command_name",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([cutoff(now)], |row| {
            Ok(json!({
                "projectPath": row.get::<_, String>(0)?, "commandName": row.get::<_, String>(1)?,
                "count": row.get::<_, u64>(2)?, "lastStartedAt": row.get::<_, u64>(3)?
            }))
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_tray_projects(app: AppHandle) -> Result<Value, String> {
    let db = storage::open_database_path(&storage::database_path(&app)?)?;
    let mut result = storage::read_projects(&db)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let usage = read(&db, now)?;
    let mut mapped = Vec::new();
    // Stored project paths may be aliases; launches use canonical paths.
    for workspace in result["data"]["workspaces"]
        .as_array()
        .into_iter()
        .flatten()
    {
        for project in workspace["projects"].as_array().into_iter().flatten() {
            if let Some(path) = project["path"].as_str() {
                let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.into());
                for item in &usage {
                    if item["projectPath"].as_str() == canonical.to_str() {
                        let mut item = item.clone();
                        item["projectPath"] = json!(path);
                        mapped.push(item);
                    }
                }
            }
        }
    }
    result["data"]["commandUsage"] = json!(mapped);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts_unique_launches_and_excludes_old_history() {
        let mut db = Connection::open_in_memory().unwrap();
        let now = WINDOW_MS * 2;
        let run = |id: &str, at| ScriptRun {
            id: id.into(),
            run_id: at,
            project: json!({"path":"/project"}),
            command: json!({"name":"dev"}),
            status: "running".into(),
            started_at: at,
            ended_at: None,
            exit_code: None,
            error: None,
            restart_pending: false,
            restarted_as: None,
        };
        insert(&mut db, &run("expired", now - WINDOW_MS - 1)).unwrap();
        insert(&mut db, &run("boundary", now - WINDOW_MS)).unwrap();
        insert(&mut db, &run("latest", now)).unwrap();
        insert(&mut db, &run("latest", now)).unwrap();
        let usage = read(&db, now).unwrap();
        assert_eq!(usage[0]["count"], 2);
        assert_eq!(usage[0]["lastStartedAt"], now);
        assert!(read(&db, now + WINDOW_MS + 1).unwrap().is_empty());
    }
}
