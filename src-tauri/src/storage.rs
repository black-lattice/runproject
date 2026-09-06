use rusqlite::{params, Connection};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {}", error))?;
    fs::create_dir_all(&directory).map_err(|error| format!("创建应用数据目录失败: {}", error))?;
    Ok(directory.join("runproject.db"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?)
        .map_err(|error| format!("打开任务数据库失败: {}", error))?;
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY NOT NULL,
                data TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lists (
                position INTEGER PRIMARY KEY NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_store (
                key TEXT PRIMARY KEY NOT NULL,
                data TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| format!("初始化任务数据库失败: {}", error))?;
    Ok(connection)
}

#[tauri::command]
pub fn load_productivity_data(app: AppHandle) -> Result<Value, String> {
    let connection = open_database(&app)?;
    let initialized: bool = connection
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'initialized'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|value| value == "1")
        .unwrap_or(false);

    let mut task_statement = connection
        .prepare("SELECT data FROM tasks ORDER BY position ASC")
        .map_err(|error| format!("读取任务失败: {}", error))?;
    let tasks = task_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("读取任务失败: {}", error))?
        .filter_map(Result::ok)
        .filter_map(|data| serde_json::from_str::<Value>(&data).ok())
        .collect::<Vec<_>>();

    let mut list_statement = connection
        .prepare("SELECT data FROM lists ORDER BY position ASC")
        .map_err(|error| format!("读取清单失败: {}", error))?;
    let lists = list_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("读取清单失败: {}", error))?
        .filter_map(Result::ok)
        .filter_map(|data| serde_json::from_str::<Value>(&data).ok())
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "initialized": initialized,
        "tasks": tasks,
        "lists": lists,
    }))
}

#[tauri::command]
pub fn save_productivity_data(
    app: AppHandle,
    tasks: Vec<Value>,
    lists: Vec<Value>,
) -> Result<(), String> {
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("开始保存任务事务失败: {}", error))?;

    transaction
        .execute("DELETE FROM tasks", [])
        .map_err(|error| format!("清理旧任务失败: {}", error))?;
    {
        let mut statement = transaction
        .prepare(
                "INSERT INTO tasks (id, data, position, updated_at) VALUES (?1, ?2, ?3, strftime('%s','now'))",
            )
            .map_err(|error| format!("准备保存任务失败: {}", error))?;
        for (position, task) in tasks.into_iter().enumerate() {
            let id = task
                .get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| task.get("id").map(ToString::to_string))
                .unwrap_or_else(|| "unknown".to_string());
            let data = serde_json::to_string(&task)
                .map_err(|error| format!("序列化任务失败: {}", error))?;
            statement
                .execute(params![id, data, position as i64])
                .map_err(|error| format!("保存任务失败: {}", error))?;
        }
    }

    transaction
        .execute("DELETE FROM lists", [])
        .map_err(|error| format!("清理旧清单失败: {}", error))?;
    {
        let mut statement = transaction
            .prepare("INSERT INTO lists (position, data) VALUES (?1, ?2)")
            .map_err(|error| format!("准备保存清单失败: {}", error))?;
        for (position, list) in lists.iter().enumerate() {
            let data = serde_json::to_string(list)
                .map_err(|error| format!("序列化清单失败: {}", error))?;
            statement
                .execute(params![position as i64, data])
                .map_err(|error| format!("保存清单失败: {}", error))?;
        }
    }

    transaction
        .execute(
            "INSERT INTO app_meta (key, value) VALUES ('initialized', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|error| format!("保存数据库状态失败: {}", error))?;
    transaction
        .commit()
        .map_err(|error| format!("提交任务事务失败: {}", error))?;
    Ok(())
}

#[tauri::command]
pub fn load_project_data(app: AppHandle) -> Result<Value, String> {
    let connection = open_database(&app)?;
    let data = connection
        .query_row(
            "SELECT data FROM project_store WHERE key = 'state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| serde_json::from_str::<Value>(&value).ok());

    Ok(serde_json::json!({
        "initialized": data.is_some(),
        "data": data.unwrap_or_else(|| serde_json::json!({})),
    }))
}

#[tauri::command]
pub fn save_project_data(app: AppHandle, data: Value) -> Result<(), String> {
    let connection = open_database(&app)?;
    let serialized =
        serde_json::to_string(&data).map_err(|error| format!("序列化项目数据失败: {}", error))?;
    connection
        .execute(
            "INSERT INTO project_store (key, data) VALUES ('state', ?1)
             ON CONFLICT(key) DO UPDATE SET data = excluded.data",
            params![serialized],
        )
        .map_err(|error| format!("保存项目数据失败: {}", error))?;
    Ok(())
}

#[tauri::command]
pub fn clear_project_data(app: AppHandle) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM project_store WHERE key = 'state'", [])
        .map_err(|error| format!("清理项目数据库失败: {}", error))?;
    Ok(())
}
