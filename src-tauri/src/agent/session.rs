use super::*;

impl Hub {
    pub(super) fn thread(
        &self,
        conn: &Connection,
        id: Option<String>,
        cwd: &str,
        manager: bool,
    ) -> Result<String, String> {
        let instructions = if manager {
            MANAGER_INSTRUCTIONS
        } else {
            WORKER_INSTRUCTIONS
        };
        let mut params = json!({"cwd":cwd,"sandbox":if manager {"read-only"} else {"workspace-write"},
            "approvalPolicy":if manager {"never"} else {"on-request"},"developerInstructions":instructions});
        if manager {
            let config = self.live.lock().unwrap().store.manager_config.clone();
            if !config.codex_model.is_empty() {
                params["model"] = json!(config.codex_model);
            }
            if !config.codex_effort.is_empty() {
                params["config"] = json!({"model_reasoning_effort":config.codex_effort});
            }
        }
        let method = if let Some(id) = id {
            params["threadId"] = json!(id);
            params["excludeTurns"] = json!(true);
            "thread/resume"
        } else {
            "thread/start"
        };
        let result = conn.request(method, params)?;
        result["thread"]["id"]
            .as_str()
            .map(str::to_owned)
            .ok_or("Codex 未返回会话 ID".into())
    }

    pub(super) fn turn(
        &self,
        conn: &Connection,
        thread: &str,
        prompt: String,
        manager: bool,
        task_id: Option<&str>,
    ) -> Result<String, String> {
        let events = conn.subscribe(); // Subscribe before turn/start, including very fast completions.
        let mut params = json!({"threadId":thread,"input":[{"type":"text","text":prompt}]});
        if manager {
            params["outputSchema"] = plan_schema();
            let config = self.live.lock().unwrap().store.manager_config.clone();
            if !config.codex_model.is_empty() {
                params["model"] = json!(config.codex_model);
            }
            if !config.codex_effort.is_empty() {
                params["effort"] = json!(config.codex_effort);
            }
        }
        let result = conn.request("turn/start", params)?;
        let turn_id = result["turn"]["id"]
            .as_str()
            .ok_or("Codex 未返回轮次 ID")?
            .to_owned();
        if let Some(id) = task_id {
            self.change(|live| {
                if let Some(t) = live.store.tasks.iter_mut().find(|t| t.id == id) {
                    t.turn_id = Some(turn_id.clone());
                    t.status = "running".into();
                }
            });
        }
        let mut answer = String::new();
        let mut streamed = String::new();
        loop {
            let event = match events.recv_timeout(Duration::from_secs(1)) {
                Ok(event) => event,
                Err(mpsc::RecvTimeoutError::Timeout) if conn.alive.load(Ordering::SeqCst) => {
                    continue
                }
                _ => return Err("Codex app-server 连接中断，任务未确认完成".into()),
            };
            let method = event["method"].as_str().unwrap_or("");
            if method == "runproject/disconnected" {
                return Err("Codex app-server 连接中断".into());
            }
            let p = &event["params"];
            if p["threadId"] != thread {
                continue;
            }
            // Multiple turns can be queued on one thread; ignore a different turn.
            if p.get("turnId")
                .and_then(Value::as_str)
                .is_some_and(|id| id != turn_id)
            {
                continue;
            }
            if method == "item/agentMessage/delta" {
                streamed.push_str(p["delta"].as_str().unwrap_or(""));
                if let Some(id) = task_id {
                    let mut live = self.live.lock().unwrap();
                    if let Some(t) = live.store.tasks.iter_mut().find(|t| t.id == id) {
                        t.result = short(&streamed, 50000);
                    }
                    drop(live);
                    (self.notify)("agent-changed");
                }
            } else if method == "item/completed" {
                let item = &p["item"];
                if item["type"] == "agentMessage" {
                    answer = item["text"].as_str().unwrap_or("").into();
                }
                if let Some(id) = task_id {
                    let log = match item["type"].as_str().unwrap_or("") {
                        "commandExecution" => format!(
                            "{} · {}",
                            item["command"].as_str().unwrap_or("命令"),
                            item["status"].as_str().unwrap_or("")
                        ),
                        "fileChange" => {
                            format!("文件修改 · {}", item["status"].as_str().unwrap_or(""))
                        }
                        "agentMessage" => short(item["text"].as_str().unwrap_or(""), 1200),
                        _ => String::new(),
                    };
                    if !log.is_empty() {
                        self.change(|live| {
                            if let Some(t) = live.store.tasks.iter_mut().find(|t| t.id == id) {
                                t.progress.push(log);
                                if t.progress.len() > 60 {
                                    t.progress.remove(0);
                                }
                            }
                        });
                    }
                }
            } else if method == "turn/completed" && p["turn"]["id"] == turn_id {
                return match p["turn"]["status"].as_str() {
                    Some("completed") => Ok(if answer.is_empty() { streamed } else { answer }),
                    Some("interrupted") => Err("任务已停止，已发生的文件修改仍保留。".into()),
                    _ => Err(p["turn"]["error"]["message"]
                        .as_str()
                        .unwrap_or("Codex 执行失败")
                        .into()),
                };
            }
        }
    }
}
