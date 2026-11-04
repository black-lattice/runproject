import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Input,
  Modal,
  Segmented,
  Select,
} from "antd";

export const DEFAULT_MANAGER_CONFIG = {
  backend: "codex",
  codexModel: "",
  codexEffort: "",
  apiBase: "",
  apiModel: "",
  apiEffort: "",
  apiFormat: "json_object",
};
const EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];

export default function ManagerSettings({
  open,
  onClose,
  data,
  desktop,
  onSaved,
}) {
  const [config, setConfig] = useState(DEFAULT_MANAGER_CONFIG);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [catalog, setCatalog] = useState({ models: [] });
  const [apiModels, setApiModels] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    if (!open) {
      setKey("");
      return;
    }
    setConfig({ ...DEFAULT_MANAGER_CONFIG, ...data.managerConfig });
    setKey("");
    setClearKey(false);
    setApiModels([]);
    setError("");
    setSuccess("");
  }, [open]);
  const update = (field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setSuccess("");
  };
  const run = async (action, fn) => {
    setBusy(action);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const apiArgs = { config, apiKey: key || null, clearApiKey: clearKey };
  const selectedModel = catalog.models.find(
    (m) => m.model === config.codexModel,
  );
  const efforts =
    selectedModel?.supportedReasoningEfforts?.map((e) => ({
      value: e.reasoningEffort,
      label: e.reasoningEffort,
      title: e.description,
    })) || EFFORTS.map((value) => ({ value, label: value }));
  const save = () =>
    run("save", async () => {
      await invoke("agent_save_manager", apiArgs);
      await onSaved();
      setKey("");
      onClose();
    });
  const readModels = () =>
    run("models", async () => {
      if (config.backend === "codex") setCatalog(await invoke("agent_models"));
      else setApiModels(await invoke("agent_api_models", apiArgs));
    });
  const chooseCodexModel = (value) => {
    const model = catalog.models.find((m) => m.model === value);
    setConfig((current) => ({
      ...current,
      codexModel: value,
      codexEffort: model?.defaultReasoningEffort || "",
    }));
  };
  return (
    <Modal
      open={open}
      title="总管 Agent 设置"
      width={620}
      onCancel={onClose}
      onOk={save}
      okText="保存配置"
      confirmLoading={busy === "save"}
      okButtonProps={{ disabled: !desktop || !!busy || data.busy }}
      cancelButtonProps={{ disabled: !!busy }}
      destroyOnHidden
    >
      <div className="agent-settings">
        <p>
          总管负责理解需求、分派 Worker 和汇报结果。这里的模型设置只作用于总管。
        </p>
        <Segmented
          block
          aria-label="总管模型后端"
          value={config.backend}
          disabled={!!busy}
          options={[
            { label: "本机 Codex", value: "codex" },
            { label: "OpenAI 兼容 API", value: "api" },
          ]}
          onChange={(value) => update("backend", value)}
        />
        {config.backend === "codex" ? (
          <>
            <div className="agent-setting-heading">
              <label htmlFor="manager-model">总管模型</label>
              <Button
                size="small"
                disabled={!desktop || !!busy}
                loading={busy === "models"}
                onClick={readModels}
              >
                读取本机模型
              </Button>
            </div>
            <AutoComplete
              id="manager-model"
              aria-label="总管模型"
              value={config.codexModel}
              onChange={(value) => update("codexModel", value)}
              onSelect={chooseCodexModel}
              placeholder="留空沿用 CLI，也可输入模型 ID"
              allowClear
              options={catalog.models.map((m) => ({
                value: m.model,
                label: m.displayName || m.model,
              }))}
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
            />
            <label htmlFor="manager-effort">推理强度</label>
            <Select
              id="manager-effort"
              aria-label="推理强度"
              value={config.codexEffort}
              onChange={(value) => update("codexEffort", value)}
              options={[{ value: "", label: "沿用 CLI 配置" }, ...efforts]}
            />
            {catalog.defaultModel && (
              <p>
                本机 CLI 默认：{catalog.defaultModel} ·{" "}
                {catalog.defaultEffort || "默认强度"}
                。可选强度来自所选模型；自定义模型需自行确认支持的参数。
              </p>
            )}
            <p>
              沿用本机 Codex 的登录和服务配置，自定义模型 ID 也由该服务处理。
            </p>
          </>
        ) : (
          <>
            <label htmlFor="manager-api-base">API 地址</label>
            <Input
              id="manager-api-base"
              value={config.apiBase}
              placeholder="https://your-provider.example/v1"
              onChange={(e) => {
                update("apiBase", e.target.value);
                setApiModels([]);
              }}
              autoComplete="off"
            />
            <label htmlFor="manager-api-key">API Key</label>
            <Input.Password
              id="manager-api-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setClearKey(false);
              }}
              autoComplete="new-password"
              placeholder={
                data.hasApiKey && config.apiBase === data.managerConfig?.apiBase
                  ? "已保存 · 留空保留原密钥"
                  : "输入密钥；无需认证的本地服务可留空"
              }
            />
            {data.hasApiKey && (
              <Checkbox
                checked={clearKey}
                onChange={(e) => {
                  setClearKey(e.target.checked);
                  if (e.target.checked) setKey("");
                }}
              >
                移除已保存的密钥
              </Checkbox>
            )}
            <div className="agent-setting-heading">
              <label htmlFor="manager-api-model">模型 ID</label>
              <Button
                size="small"
                disabled={!desktop || !config.apiBase || !!busy}
                loading={busy === "models"}
                onClick={readModels}
              >
                读取模型列表
              </Button>
            </div>
            <AutoComplete
              id="manager-api-model"
              aria-label="API 模型 ID"
              value={config.apiModel}
              onChange={(value) => update("apiModel", value)}
              options={apiModels.map((value) => ({ value }))}
              placeholder="填写服务商提供的完整模型 ID"
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
            />
            <label htmlFor="manager-api-effort">推理强度</label>
            <Select
              id="manager-api-effort"
              aria-label="API 推理强度"
              value={config.apiEffort}
              onChange={(value) => update("apiEffort", value)}
              options={[
                { value: "", label: "使用服务默认（不发送参数）" },
                ...EFFORTS.map((value) => ({ value, label: value })),
              ]}
            />
            <label htmlFor="manager-api-format">结构化输出</label>
            <Select
              id="manager-api-format"
              aria-label="结构化输出"
              value={config.apiFormat}
              onChange={(value) => update("apiFormat", value)}
              options={[
                { value: "json_object", label: "JSON 模式" },
                { value: "json_schema", label: "严格 JSON Schema" },
                { value: "prompt", label: "仅提示词约束（兼容模式）" },
              ]}
            />
            <p>
              接口需兼容 Chat Completions。推理强度使用
              reasoning_effort；服务不支持时保留默认。模型需能返回 JSON
              任务计划。
            </p>
            <p>
              请求会包含你的需求、项目名称与路径、近期对话和 Worker
              结果。密钥仅保存到本机系统凭据库，切换 API
              地址不会把原密钥发给新地址。
            </p>
            <Button
              disabled={
                !desktop || !config.apiBase || !config.apiModel || !!busy
              }
              loading={busy === "test"}
              onClick={() =>
                run("test", async () =>
                  setSuccess(await invoke("agent_test_api", apiArgs)),
                )
              }
            >
              测试模型连接
            </Button>
          </>
        )}
        <p>
          配置保存后从下一次处理生效，保留对话记录与任务账本。Worker
          的模型不随之改变。
        </p>
        {data.busy && (
          <Alert type="info" message="总管正在处理消息，完成后即可保存配置。" />
        )}
        {error && <Alert type="error" showIcon message={error} />}
        {success && <Alert type="success" showIcon message={success} />}
      </div>
    </Modal>
  );
}
