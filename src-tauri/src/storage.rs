use rusqlite::{params, Connection};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败: {}", error))?;
    fs::create_dir_all(&directory).map_err(|error| format!("创建应用数据目录失败: {}", error))?;
    #[cfg(unix)]
    {
        // Protect the database and its SQLite WAL/SHM files, which may contain
        // the MCP bearer token, from other users on this machine.
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("保护应用数据目录失败: {}", error))?;
    }
    Ok(directory.join("runproject.db"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    open_database_path(&database_path(app)?)
}

pub(crate) fn open_database_path(path: &Path) -> Result<Connection, String> {
    let mut connection =
        Connection::open(path).map_err(|error| format!("打开任务数据库失败: {}", error))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
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
    // Older installed builds stored tasks without an explicit display order.
    // Serialize the migration so simultaneous UI/MCP opens cannot race ALTER.
    let has_position = |db: &Connection| -> Result<bool, String> {
        db.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='position'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .map_err(|e| e.to_string())
    };
    if !has_position(&connection)? {
        let tx = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        if !has_position(&tx)? {
            tx.execute_batch("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE tasks SET position = rowid;")
                .map_err(|e| format!("迁移旧版任务排序失败: {e}"))?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(connection)
}

#[tauri::command]
pub fn load_productivity_data(app: AppHandle) -> Result<Value, String> {
    let mut connection = open_database(&app)?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    read_productivity(&tx)
}

pub(crate) fn read_productivity(connection: &Connection) -> Result<Value, String> {
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
        .map(|data| {
            data.map_err(|e| e.to_string())
                .and_then(|data| serde_json::from_str::<Value>(&data).map_err(|e| e.to_string()))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut list_statement = connection
        .prepare("SELECT data FROM lists ORDER BY position ASC")
        .map_err(|error| format!("读取清单失败: {}", error))?;
    let lists = list_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("读取清单失败: {}", error))?
        .map(|data| {
            data.map_err(|e| e.to_string())
                .and_then(|data| serde_json::from_str::<Value>(&data).map_err(|e| e.to_string()))
        })
        .collect::<Result<Vec<_>, _>>()?;

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
    base: Value,
    initialize: Option<bool>,
) -> Result<Value, String> {
    let mut connection = open_database(&app)?;
    let tx = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let current = read_productivity(&tx)?;
    let next = if initialize.unwrap_or(false) && current["initialized"] == true {
        current.clone()
    } else {
        let mut next = crate::data_merge::merge(
            &base,
            &serde_json::json!({"tasks": tasks, "lists": lists}),
            &current,
            "",
        );
        repair_removed_list_references(&base, &mut next);
        next["initialized"] = serde_json::json!(true);
        write_productivity(&tx, &next)?;
        next
    };
    tx.commit().map_err(|e| e.to_string())?;
    let _ = app.emit("productivity-changed", ());
    Ok(next)
}

// A client may create a task while another client removes its list.
// Keep that task reachable instead of retaining a dangling category.
fn repair_removed_list_references(base: &Value, next: &mut Value) {
    let before: Vec<_> = base["lists"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| l[0].as_str())
        .collect();
    let after: Vec<_> = next["lists"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| l[0].as_str().map(str::to_owned))
        .collect();
    let removed: Vec<_> = before
        .into_iter()
        .filter(|name| !after.iter().any(|n| n == name))
        .collect();
    for task in next["tasks"].as_array_mut().into_iter().flatten() {
        if task["list"]
            .as_str()
            .is_some_and(|name| removed.contains(&name))
        {
            task["list"] = serde_json::json!("收件箱");
        }
        for field in ["lists", "categories"] {
            if let Some(values) = task[field].as_array_mut() {
                for value in values {
                    if value.as_str().is_some_and(|name| removed.contains(&name)) {
                        *value = serde_json::json!("收件箱");
                    }
                }
            }
        }
    }
}

pub(crate) fn write_productivity(transaction: &Connection, data: &Value) -> Result<(), String> {
    let tasks = data["tasks"].as_array().ok_or("tasks 必须为数组")?;
    let lists = data["lists"].as_array().ok_or("lists 必须为数组")?;
    transaction
        .execute("DELETE FROM tasks", [])
        .map_err(|error| format!("清理旧任务失败: {}", error))?;
    {
        let mut statement = transaction
        .prepare(
                "INSERT INTO tasks (id, data, position, updated_at) VALUES (?1, ?2, ?3, strftime('%s','now'))",
            )
            .map_err(|error| format!("准备保存任务失败: {}", error))?;
        for (position, task) in tasks.iter().enumerate() {
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
    Ok(())
}

#[tauri::command]
pub fn load_project_data(app: AppHandle) -> Result<Value, String> {
    let connection = open_database(&app)?;
    read_projects(&connection)
}

pub(crate) fn read_projects(connection: &Connection) -> Result<Value, String> {
    use rusqlite::OptionalExtension;
    let raw: Option<String> = connection
        .query_row(
            "SELECT data FROM project_store WHERE key = 'state'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let data = raw
        .map(|raw| serde_json::from_str::<Value>(&raw))
        .transpose()
        .map_err(|e| e.to_string())?;
    Ok(
        serde_json::json!({"initialized": data.is_some(), "data": data.unwrap_or_else(|| serde_json::json!({"workspaces": [], "workspaceTags": {}, "projectTags": {}, "commandTags": {}, "preferences": {}}))}),
    )
}

pub(crate) fn write_projects(connection: &Connection, data: &Value) -> Result<(), String> {
    connection.execute("INSERT INTO project_store (key, data) VALUES ('state', ?1) ON CONFLICT(key) DO UPDATE SET data = excluded.data", params![data.to_string()]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_project_data(
    app: AppHandle,
    data: Value,
    base: Value,
    initialize: Option<bool>,
) -> Result<Value, String> {
    let mut connection = open_database(&app)?;
    let tx = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let current = read_projects(&tx)?;
    let next = if initialize.unwrap_or(false) && current["initialized"] == true {
        current["data"].clone()
    } else {
        let next = crate::data_merge::merge(&base, &data, &current["data"], "");
        write_projects(&tx, &next)?;
        next
    };
    tx.commit().map_err(|e| e.to_string())?;
    let _ = app.emit("projects-changed", ());
    Ok(next)
}

#[tauri::command]
pub fn clear_project_data(app: AppHandle) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM project_store WHERE key = 'state'", [])
        .map_err(|e| e.to_string())?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn migrates_legacy_tasks_without_losing_records() {
        let path =
            std::env::temp_dir().join(format!("runproject-legacy-{}.db", uuid::Uuid::new_v4()));
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE TABLE tasks(id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);").unwrap();
            db.execute(
                "INSERT INTO tasks VALUES(?1,?2,?3)",
                params!["old", r#"{"id":"old","title":"保留旧任务"}"#, 10],
            )
            .unwrap();
        }
        for _ in 0..2 {
            let db = open_database_path(&path).unwrap();
            let data = read_productivity(&db).unwrap();
            assert_eq!(data["tasks"], json!([{"id":"old","title":"保留旧任务"}]));
            assert_eq!(
                db.query_row("SELECT position FROM tasks", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                1
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn new_task_in_concurrently_removed_list_moves_to_inbox() {
        let base = json!({"lists":[["已移除","0"]],"tasks":[]});
        let local = json!({"lists":[["已移除","0"]],"tasks":[{"id":"new","list":"已移除","lists":["已移除"]}]});
        let remote = json!({"lists":[],"tasks":[]});
        let mut result = crate::data_merge::merge(&base, &local, &remote, "");
        repair_removed_list_references(&base, &mut result);
        assert_eq!(result["tasks"][0]["list"], "收件箱");
        assert_eq!(result["tasks"][0]["lists"], json!(["收件箱"]));
    }
}
