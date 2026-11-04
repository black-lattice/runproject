use super::*;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct ManagerConfig {
    pub backend: String,
    pub codex_model: String,
    pub codex_effort: String,
    pub api_base: String,
    pub api_model: String,
    pub api_effort: String,
    pub api_format: String,
}

impl Default for ManagerConfig {
    fn default() -> Self {
        Self {
            backend: "codex".into(),
            codex_model: String::new(),
            codex_effort: String::new(),
            api_base: String::new(),
            api_model: String::new(),
            api_effort: String::new(),
            api_format: "json_object".into(),
        }
    }
}

impl ManagerConfig {
    pub(super) fn validate(mut self) -> Result<Self, String> {
        for s in [
            &mut self.codex_model,
            &mut self.codex_effort,
            &mut self.api_base,
            &mut self.api_model,
            &mut self.api_effort,
        ] {
            *s = s.trim().to_owned();
        }
        if !matches!(self.backend.as_str(), "codex" | "api") {
            return Err("未知的总管后端".into());
        }
        for effort in [&self.codex_effort, &self.api_effort] {
            if !matches!(
                effort.as_str(),
                "" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
            ) {
                return Err("不支持的推理强度".into());
            }
        }
        if !matches!(
            self.api_format.as_str(),
            "json_object" | "json_schema" | "prompt"
        ) {
            return Err("不支持的输出格式".into());
        }
        if self.backend == "api" {
            api::endpoint(&self.api_base)?;
            if self.api_model.is_empty() {
                return Err("请填写 API 模型 ID".into());
            }
        }
        if self.codex_model.len() > 256 || self.api_model.len() > 256 {
            return Err("模型 ID 过长".into());
        }
        Ok(self)
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CredentialRef {
    pub endpoint: String,
    pub id: String,
}

pub(super) fn credential(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.changzhenhua.runproject.agent-manager", id)
        .map_err(|_| "无法访问系统凭据库".into())
}

impl Hub {
    pub(super) fn api_key(&self, config: &ManagerConfig) -> Result<Option<String>, String> {
        let reference = self.live.lock().unwrap().store.manager_credential.clone();
        match reference.filter(|r| {
            api::endpoint(&config.api_base).ok().as_deref() == Some(r.endpoint.as_str())
        }) {
            None => Ok(None),
            Some(r) => credential(&r.id)?
                .get_password()
                .map(Some)
                .map_err(|_| "无法读取已保存的 API Key，请重新输入或检查系统凭据库。".into()),
        }
    }

    pub(super) fn save_manager_config(
        &self,
        config: ManagerConfig,
        key: Option<String>,
        clear_key: bool,
    ) -> Result<(), String> {
        let _gate = self
            .manager_gate
            .try_lock()
            .map_err(|_| "总管正在处理消息，请完成后再保存配置；Worker 无需停止。")?;
        let config = config.validate()?;
        let old = self.live.lock().unwrap().store.manager_credential.clone();
        let endpoint = if config.api_base.trim().is_empty() {
            None
        } else {
            Some(api::endpoint(&config.api_base)?)
        };
        let mut reference = old
            .clone()
            .filter(|r| Some(r.endpoint.as_str()) == endpoint.as_deref());
        if clear_key {
            reference = None;
        }
        if let Some(key) = key.filter(|k| !k.is_empty()) {
            if clear_key {
                return Err("请不要同时输入新密钥和移除密钥".into());
            }
            let endpoint = endpoint.ok_or("保存密钥前请填写 API 地址")?;
            let id = uuid::Uuid::new_v4().to_string();
            credential(&id)?
                .set_password(&key)
                .map_err(|_| "密钥未保存：系统凭据库不可用或拒绝访问。".to_owned())?;
            reference = Some(CredentialRef { endpoint, id });
        }
        // Persist the new reference before deleting an old key; a failed SQLite
        // write must never leave the previous persisted configuration unusable.
        let mut live = self.live.lock().unwrap();
        let mut next = live.store.clone();
        if next.manager_config != config {
            next.manager_thread = None;
            next.api_history.clear();
        }
        next.manager_config = config;
        next.manager_credential = reference.clone();
        persist_store(&self.database, &next)?;
        live.store = next;
        drop(live);
        if let Some(old) =
            old.filter(|r| Some(r.id.as_str()) != reference.as_ref().map(|n| n.id.as_str()))
        {
            if let Ok(entry) = credential(&old.id) {
                let _ = entry.delete_credential();
            }
        }
        (self.notify)("agent-changed");
        Ok(())
    }

    pub(super) fn model_catalog(self: &Arc<Self>) -> Result<Value, String> {
        let conn = self.connect()?;
        let mut models = Vec::new();
        let mut cursor = Value::Null;
        loop {
            let page = conn.request(
                "model/list",
                json!({"cursor":cursor,"limit":100,"includeHidden":false}),
            )?;
            models.extend(
                page["data"]
                    .as_array()
                    .ok_or("Codex 未返回模型列表")?
                    .clone(),
            );
            let next = page["nextCursor"].clone();
            if next.is_null() {
                break;
            }
            if next == cursor || models.len() > 1000 {
                return Err("Codex 模型列表分页异常".into());
            }
            cursor = next;
        }
        let config = conn.request("config/read", json!({"includeLayers":false}))?;
        Ok(
            json!({"models":models,"defaultModel":config["config"]["model"],"defaultEffort":config["config"]["model_reasoning_effort"]}),
        )
    }
}
