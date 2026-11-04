import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Alert, Button, Empty, Input, Modal, Select, Spin, Tag } from "antd";
import { Bot, FolderPlus, Send, Settings2, Square } from "lucide-react";
import PageHeading from "@/components/PageHeading";
import ManagerSettings, { DEFAULT_MANAGER_CONFIG } from "./ManagerSettings";
import "./style.css";

const STATUS = {
  queued: ["排队中", "default"],
  starting: ["建立会话", "processing"],
  running: ["执行中", "processing"],
  waiting: ["等待确认", "warning"],
  completed: ["已完成", "success"],
  failed: ["失败", "error"],
  interrupted: ["已停止", "default"],
};
const INITIAL = {
  connected: false,
  busy: false,
  messages: [],
  tasks: [],
  approvals: [],
  projects: [],
  binary: "",
  managerConfig: DEFAULT_MANAGER_CONFIG,
  hasApiKey: false,
};

export default function AgentPage() {
  const [data, setData] = useState(INITIAL);
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState(false);
  const [managerSettings, setManagerSettings] = useState(false);
  const [binary, setBinary] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef(null);
  const desktop = isTauri();
  const refresh = useCallback(async () => {
    if (desktop) setData(await invoke("agent_snapshot"));
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false,
      timer = null,
      unlisten;
    const load = async () => {
      try {
        const snapshot = await invoke("agent_snapshot");
        if (!cancelled) setData(snapshot);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    listen("agent-changed", () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        load();
      }, 200);
    })
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch((e) => setError(String(e)));
    load();
    // Recover the latest snapshot even if an event arrived during subscription.
    const poll = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data.messages.length, data.busy]);

  const execute = async (command, args) => {
    setError("");
    try {
      await invoke(command, args);
      await refresh();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };

  const connect = async () => {
    setLoading(true);
    const ok = await execute("agent_connect", { binary: binary.trim() });
    setLoading(false);
    if (ok) setSettings(false);
  };

  const send = async () => {
    if (!draft.trim() || sending || !desktop) return;
    setSending(true);
    if (await execute("agent_send", { text: draft.trim(), taskId: target }))
      setDraft("");
    setSending(false);
  };

  const addProject = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择 Worker 的项目目录",
      });
      if (path) await execute("agent_add_project", { path });
    } catch (e) {
      setError(String(e));
    }
  };
  const selectedTask = data.tasks.find((task) => task.id === detail);
  const running = data.tasks.filter((task) =>
    ["queued", "starting", "running", "waiting"].includes(task.status),
  ).length;

  return (
    <div className="agent-page h-full flex flex-col">
      <PageHeading
        title="总管"
        description="在这里提需求，由总管分派项目 Worker 并收回结果"
      >
        <Button
          aria-label="总管模型设置"
          icon={<Bot size={15} />}
          onClick={() => setManagerSettings(true)}
        >
          {data.managerConfig?.backend === "api"
            ? `API · ${data.managerConfig.apiModel || "配置模型"}`
            : `${data.managerConfig?.codexModel || "Codex 默认"}${data.managerConfig?.codexEffort ? ` · ${data.managerConfig.codexEffort}` : ""}`}
        </Button>
        <Tag color={data.connected ? "success" : "default"}>
          {data.connected ? "Worker Codex 已连接" : "Worker 尚未连接"}
        </Tag>
        <Button
          icon={<Settings2 size={15} />}
          onClick={() => {
            setBinary(data.binary);
            setSettings(true);
          }}
        >
          连接设置
        </Button>
      </PageHeading>
      {!desktop && (
        <Alert
          type="info"
          showIcon
          message="请在 RunProject 桌面应用中使用总管，浏览器预览无法启动本机 Codex。"
        />
      )}
      {(error || data.error) && (
        <Alert
          type="error"
          showIcon
          message={error || data.error}
          closable
          onClose={() => setError("")}
        />
      )}
      <div className="agent-workspace">
        <section className="agent-chat" aria-label="总管对话">
          <div className="agent-messages" role="log" aria-live="polite">
            {!data.messages.length && (
              <div className="agent-intro">
                <div className="agent-avatar">
                  <Bot size={26} />
                </div>
                <h2>把需求交给总管</h2>
                <p>
                  说明项目和目标，多个项目的需求可以一起发。后续补充会接着原任务继续。
                </p>
                <div className="agent-examples">
                  {[
                    "列出当前可以分派的项目",
                    "检查项目的启动流程，并汇报发现的问题",
                  ].map((text) => (
                    <button key={text} onClick={() => setDraft(text)}>
                      {text}
                    </button>
                  ))}
                </div>
                {!data.connected && data.managerConfig?.backend !== "api" && (
                  <Button
                    type="primary"
                    disabled={!desktop}
                    onClick={() => {
                      setBinary(data.binary);
                      setSettings(true);
                    }}
                  >
                    连接本机 Codex
                  </Button>
                )}
              </div>
            )}
            {data.messages.map((message, index) => (
              <article
                className={`agent-message is-${message.role}`}
                key={`${message.time}-${index}`}
              >
                <div className="agent-message-label">
                  {message.role === "user"
                    ? "你"
                    : message.role === "assistant"
                      ? "总管"
                      : "运行状态"}
                  <time>
                    {new Date(message.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <div className="agent-message-text">{message.text}</div>
              </article>
            ))}
            {data.busy && (
              <div className="agent-thinking">
                <Spin size="small" /> 总管正在处理…
              </div>
            )}
            <div ref={bottom} />
          </div>
          {data.approvals.map((request) => (
            <div className="agent-approval" key={JSON.stringify(request.id)}>
              <strong>
                Worker 需要确认
                {request.params.networkApprovalContext?.host
                  ? `访问 ${request.params.networkApprovalContext.host}`
                  : "操作"}
              </strong>
              <pre>
                {request.params.command ||
                  request.params.reason ||
                  request.params.grantRoot ||
                  "请求执行项目操作"}
              </pre>
              {request.params.cwd && <small>{request.params.cwd}</small>}
              <div className="flex gap-2 mt-2">
                <Button
                  size="small"
                  onClick={() =>
                    execute("agent_approve", {
                      requestId: request.id,
                      accept: false,
                    })
                  }
                >
                  拒绝
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    execute("agent_approve", {
                      requestId: request.id,
                      accept: true,
                    })
                  }
                >
                  允许本次
                </Button>
              </div>
            </div>
          ))}
          <div className="agent-composer">
            <div className="agent-target">
              <Select
                aria-label="选择追问任务"
                value={target}
                onChange={setTarget}
                allowClear
                placeholder="新需求 · 自动识别项目"
                options={data.tasks.map((task) => ({
                  value: task.id,
                  label: `${task.project.name} · ${task.title}`,
                }))}
              />
              <span>Enter 发送 · Shift+Enter 换行</span>
            </div>
            <Input.TextArea
              aria-label="需求"
              placeholder="例如：检查 MouseGesture 的快捷键冲突，修复后运行相关验证…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 7 }}
              maxLength={20000}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="agent-composer-footer">
              <span>
                {target
                  ? "补充要求将交给选中的任务"
                  : `${data.projects.length} 个可用项目`}
              </span>
              <Button
                type="primary"
                icon={<Send size={14} />}
                loading={sending}
                disabled={!desktop || !draft.trim()}
                onClick={send}
              >
                发送
              </Button>
            </div>
          </div>
        </section>
        <aside className="agent-tasks" aria-label="项目 Worker">
          <div className="agent-pane-title">
            <h2>项目 Worker</h2>
            <span>
              {running ? `${running} 项进行中` : `${data.tasks.length} 项任务`}
            </span>
          </div>
          <div className="agent-task-list">
            {!data.tasks.length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="分派后在这里查看进度"
              />
            )}
            {[...data.tasks].reverse().map((task) => (
              <div className="agent-task-card" key={task.id}>
                <button
                  className="agent-task-open"
                  onClick={() => setDetail(task.id)}
                >
                  <div>
                    <strong>{task.project.name}</strong>
                    <Tag color={STATUS[task.status]?.[1]}>
                      {STATUS[task.status]?.[0] || task.status}
                    </Tag>
                  </div>
                  <h3>{task.title}</h3>
                  <p>
                    {task.progress.at(-1) || task.result || "等待 Worker 执行"}
                  </p>
                </button>
                <div className="agent-task-actions">
                  <Button
                    size="small"
                    type="text"
                    onClick={() => {
                      setTarget(task.id);
                      document
                        .querySelector(".agent-composer textarea")
                        ?.focus();
                    }}
                  >
                    继续追问
                  </Button>
                  {["queued", "running", "waiting"].includes(task.status) && (
                    <Button
                      size="small"
                      type="text"
                      icon={<Square size={12} />}
                      onClick={() => execute("agent_stop", { taskId: task.id })}
                    >
                      停止
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="agent-projects">
            <div className="agent-pane-title">
              <h2>可用项目</h2>
              <Button
                type="text"
                size="small"
                icon={<FolderPlus size={15} />}
                disabled={!desktop}
                onClick={addProject}
              >
                添加
              </Button>
            </div>
            <p>沿用项目管理中的目录，也可以单独添加。</p>
            <div className="agent-project-tags">
              {data.projects.map((project) => (
                <Tag key={project.path} title={project.path}>
                  {project.name}
                </Tag>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <Modal
        open={settings}
        title="本机 Codex 连接"
        onCancel={() => setSettings(false)}
        onOk={connect}
        confirmLoading={loading}
        okText={data.connected ? "保存并连接" : "连接"}
      >
        <div className="agent-settings">
          <p>
            使用这台机器已安装、已登录的 Codex CLI。RunProject 会启动
            app-server，应用退出时关闭该进程。
          </p>
          <label htmlFor="codex-binary">Codex 可执行文件</label>
          <Input
            id="codex-binary"
            value={binary}
            onChange={(e) => setBinary(e.target.value)}
            placeholder="留空自动检测 codex"
          />
          <Button
            onClick={async () => {
              try {
                const path = await open({
                  multiple: false,
                  title: "选择 codex 可执行文件",
                });
                if (path) setBinary(path);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            选择文件
          </Button>
          <p>
            首次使用请先在终端执行 codex login。任务记录和会话 ID
            保存在本机；切换项目不会丢失上下文。
          </p>
          <p>
            Worker 默认可修改对应项目目录。需要额外权限时，会在对话区请求确认。
          </p>
        </div>
      </Modal>
      <ManagerSettings
        open={managerSettings}
        onClose={() => setManagerSettings(false)}
        data={data}
        desktop={desktop}
        onSaved={refresh}
      />
      <Modal
        open={!!selectedTask}
        footer={null}
        width={800}
        title={selectedTask?.title}
        onCancel={() => setDetail(null)}
      >
        {selectedTask && (
          <div className="agent-task-detail">
            <Tag color={STATUS[selectedTask.status]?.[1]}>
              {STATUS[selectedTask.status]?.[0]}
            </Tag>
            <p className="agent-detail-path">{selectedTask.project.path}</p>
            <h3>执行记录</h3>
            {selectedTask.progress.map((line, index) => (
              <pre key={index}>{line}</pre>
            ))}
            <h3>最新回复</h3>
            <pre>{selectedTask.result || "Worker 尚未回复"}</pre>
            <Button
              onClick={() => {
                setTarget(selectedTask.id);
                setDetail(null);
              }}
            >
              继续这个任务
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
