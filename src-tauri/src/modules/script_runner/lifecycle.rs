use super::*;

impl ScriptRunner {
    pub(super) fn operation_lock(
        &self,
        path: &str,
        script: &str,
    ) -> Result<Arc<Mutex<()>>, String> {
        let mut operations = self.operations.lock().map_err(|e| e.to_string())?;
        operations.retain(|_, lock| lock.strong_count() > 0);
        let key = (path.to_owned(), script.to_owned());
        if let Some(lock) = operations.get(&key).and_then(Weak::upgrade) {
            return Ok(lock);
        }
        let lock = Arc::new(Mutex::new(()));
        operations.insert(key, Arc::downgrade(&lock));
        Ok(lock)
    }

    fn prepare_start(
        &self,
        database: &Path,
        project_path: &str,
        script: &str,
    ) -> Result<(Value, Value, String), String> {
        let path =
            std::fs::canonicalize(project_path).map_err(|e| format!("项目路径不可用: {e}"))?;
        let db = storage::open_database_path(database)?;
        let data = storage::read_projects(&db)?["data"].clone();
        let mut project = None;
        for w in data["workspaces"].as_array().into_iter().flatten() {
            for p in w["projects"].as_array().into_iter().flatten() {
                if p["path"]
                    .as_str()
                    .is_some_and(|p| std::fs::canonicalize(p).is_ok_and(|p| p == path))
                {
                    project = Some(p.clone());
                    break;
                }
            }
        }
        let mut project =
            project.ok_or("项目未添加到工作区，请先 add_workspace 或 refresh_workspace")?;
        // Validate against today's package.json, not a possibly stale script cache.
        let package: Value = serde_json::from_str(
            &std::fs::read_to_string(path.join("package.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let script_body = package["scripts"][script]
            .as_str()
            .ok_or("package.json 中不存在该脚本，请刷新项目后重试")?;
        let command = json!({"name":script,"script":script_body});
        let canonical = path.to_string_lossy().to_string();
        let preference_key = format!(
            "{}_{}",
            project["name"].as_str().unwrap_or(""),
            project["path"].as_str().unwrap_or("")
        );
        let version = data["preferences"][&preference_key]["nodeVersion"]
            .as_str()
            .or(project["nodeVersion"].as_str());
        let command_line = build_command(&project, script, version)?;
        project["path"] = json!(canonical);
        Ok((project, command, command_line))
    }

    pub fn start(
        &self,
        database: &Path,
        project_path: &str,
        script: &str,
        emit: EventSink,
    ) -> Result<ScriptRun, String> {
        let path =
            std::fs::canonicalize(project_path).map_err(|e| format!("项目路径不可用: {e}"))?;
        let path = path.to_string_lossy().to_string();
        let lock = self.operation_lock(&path, script)?;
        let _operation = lock.lock().map_err(|e| e.to_string())?;
        let (project, command, command_line) = self.prepare_start(database, &path, script)?;
        if let Some(run) = self
            .list(Some(&path), true)?
            .into_iter()
            .find(|run| run.command["name"] == script)
        {
            return Ok(run);
        }
        let run = self.launch(project, command, command_line, emit)?;
        crate::command_usage::record(database, &run);
        Ok(run)
    }

    pub fn restart(&self, database: &Path, id: &str, emit: EventSink) -> Result<ScriptRun, String> {
        let entry = self.entry(id)?;
        let original = entry.lock().map_err(|e| e.to_string())?.info.clone();
        let path = original.project["path"].as_str().ok_or("项目路径无效")?;
        let script = original.command["name"].as_str().ok_or("脚本名称无效")?;
        let lock = self.operation_lock(path, script)?;
        let _operation = lock.lock().map_err(|e| e.to_string())?;
        // Retried requests refer to the old execution, never restart its successor.
        let successor = entry
            .lock()
            .map_err(|e| e.to_string())?
            .info
            .restarted_as
            .clone();
        if let Some(id) = successor {
            return self.get(&id);
        }
        if let Some(run) = self
            .list(Some(path), true)?
            .into_iter()
            .find(|run| run.id != original.id && run.command["name"] == script)
        {
            entry.lock().unwrap().info.restarted_as = Some(run.id.clone());
            self.publish_run(id);
            return Ok(run);
        }
        let prepared = self
            .prepare_start(database, path, script)
            .map_err(|error| {
                entry.lock().unwrap().info.error = Some(error.clone());
                self.publish_run(id);
                error
            })?;
        {
            let mut record = entry.lock().unwrap();
            record.info.restart_pending = true;
            record.info.error = None;
        }
        self.publish_run(id);
        let result: Result<ScriptRun, String> = (|| {
            let stopped = self.stop(id, false)?;
            if active(&stopped.status) {
                return Err("旧进程尚未退出，请稍后重试".into());
            }
            let run = self.launch(prepared.0, prepared.1, prepared.2, emit)?;
            crate::command_usage::record(database, &run);
            Ok(run)
        })();
        {
            let mut record = entry.lock().unwrap();
            record.info.restart_pending = false;
            match &result {
                Ok(run) => record.info.restarted_as = Some(run.id.clone()),
                Err(error) => record.info.error = Some(error.clone()),
            }
        }
        self.publish_run(id);
        result
    }

    pub(super) fn publish_run(&self, id: &str) {
        if let Ok(entry) = self.entry(id) {
            let (info, emit) = {
                let record = entry.lock().unwrap();
                (record.info.clone(), record.emit.clone())
            };
            emit("script-run-updated", json!(info));
        }
    }
}
