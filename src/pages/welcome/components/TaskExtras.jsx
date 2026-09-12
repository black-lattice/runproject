import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Tag,
  Tooltip,
} from "antd";
import {
  BoldOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileAddOutlined,
  ItalicOutlined,
  SaveOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  attachmentBytes,
  attachmentSizeLabel,
  createTaskFromTemplate,
  insertNoteFormat,
  makeTaskTemplate,
  readAttachment,
  readTaskTemplates,
  validateAttachmentBatch,
  writeTaskTemplates,
} from "@/utils/taskExtras";

const feedback = (callback, description, failed = false) =>
  callback?.({ description, ...(failed ? { variant: "destructive" } : {}) });

/** A local library; onCreateTask receives a fresh, unfinished task ready to persist. */
export function TaskTemplateLibrary({
  open,
  onClose,
  sourceTask,
  lists = [],
  onCreateTask,
  onFeedback,
}) {
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [targetList, setTargetList] = useState("收件箱");
  const [creating, setCreating] = useState(null);
  const listNames = [
    ...new Set([
      "收件箱",
      ...lists
        .map((list) => (typeof list === "string" ? list : list.name))
        .filter(Boolean),
    ]),
  ];
  useEffect(() => {
    if (!open) return;
    try {
      setTemplates(readTaskTemplates(window.localStorage));
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
    setName(sourceTask?.title || "");
    setQuery("");
    setTargetList(
      listNames.includes(sourceTask?.list) ? sourceTask.list : "收件箱",
    );
  }, [open]);
  const persist = (next) => {
    try {
      writeTaskTemplates(window.localStorage, next);
      setTemplates(next);
      return true;
    } catch (failure) {
      feedback(onFeedback, failure.message, true);
      return false;
    }
  };
  const save = () => {
    try {
      const template = makeTaskTemplate(sourceTask, name);
      if (templates.some((item) => item.name === template.name))
        throw new Error("已有同名模板，请使用不同名称");
      if (persist([template, ...templates]))
        feedback(onFeedback, "模板已保存在本机");
    } catch (failure) {
      feedback(onFeedback, failure.message, true);
    }
  };
  const create = async (template) => {
    if (!onCreateTask) return;
    setCreating(template.id);
    try {
      await onCreateTask(
        createTaskFromTemplate(template, {
          list: listNames.includes(targetList) ? targetList : "收件箱",
        }),
      );
      feedback(onFeedback, "已从模板创建任务，可继续安排日期和提醒");
      onClose?.();
    } catch (failure) {
      feedback(onFeedback, failure.message || "创建失败，请重试", true);
    } finally {
      setCreating(null);
    }
  };
  const visible = templates.filter((template) =>
    `${template.name} ${template.task.title} ${template.task.detail}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <Modal
      title="任务模板"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          保存在本机，重复使用标题、备注、标签、优先级和子任务。新任务会清空日期、完成状态及附件。
        </p>
        {error ? (
          <Alert
            type="error"
            showIcon
            title="模板库暂时不可用"
            description={
              <div className="space-y-2">
                <p>{error}</p>
                <Popconfirm
                  title="重置本机模板库？"
                  description="损坏的模板数据将被删除，此操作无法撤销。"
                  onConfirm={() => {
                    if (persist([])) setError("");
                  }}
                  okText="重置"
                  cancelText="取消"
                >
                  <Button danger size="small">
                    重置模板库
                  </Button>
                </Popconfirm>
              </div>
            }
          />
        ) : (
          <>
            {sourceTask && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="task-template-name"
                >
                  将当前任务保存为模板
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="task-template-name"
                    aria-label="模板名称"
                    className="min-w-0 flex-1"
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    onPressEnter={save}
                    placeholder="为模板取个名字"
                  />
                  <Button
                    icon={<SaveOutlined />}
                    onClick={save}
                    disabled={!name.trim()}
                  >
                    保存模板
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Input
                prefix={<SearchOutlined />}
                value={query}
                allowClear
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索模板"
                placeholder="搜索模板"
                className="min-w-0 flex-1"
              />
              <Select
                aria-label="模板任务所属清单"
                value={targetList}
                onChange={setTargetList}
                options={listNames.map((value) => ({ label: value, value }))}
                style={{ minWidth: 140, maxWidth: "100%" }}
              />
            </div>
            <div className="max-h-[48vh] space-y-3 overflow-y-auto">
              {!visible.length && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    query
                      ? "没有找到匹配的模板"
                      : "还没有模板。打开任务后可将它保存为模板。"
                  }
                />
              )}
              {visible.map((template) => (
                <article
                  key={template.id}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">
                        {template.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {template.task.subtasks.length} 个子任务 ·{" "}
                        {template.task.priority}优先级
                      </p>
                    </div>
                    <Popconfirm
                      title={`删除模板「${template.name}」？`}
                      description="已经创建的任务不会受影响。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => {
                        if (
                          persist(
                            templates.filter((item) => item.id !== template.id),
                          )
                        )
                          feedback(onFeedback, "模板已删除");
                      }}
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label={`删除模板 ${template.name}`}
                      />
                    </Popconfirm>
                  </div>
                  {template.task.detail && (
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {template.task.detail}
                    </p>
                  )}
                  {template.task.subtasks.length > 0 && (
                    <details className="text-sm text-muted-foreground">
                      <summary className="cursor-pointer">查看子任务</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {template.task.subtasks.map((item, index) => (
                          <li key={index}>{item.title}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {template.task.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </div>
                    <Button
                      type="primary"
                      size="small"
                      loading={creating === template.id}
                      disabled={creating !== null || !onCreateTask}
                      onClick={() => create(template)}
                    >
                      使用模板
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function TaskAttachments({
  task,
  onChange,
  disabled = false,
  onFeedback,
}) {
  const input = useRef(null);
  const currentTask = useRef(task);
  currentTask.current = task;
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setBusy(false), [task?.id]);
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const usedBytes = attachments.reduce(
    (sum, item) => sum + Number(item.size || 0),
    0,
  );
  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const taskId = task.id;
    setBusy(true);
    try {
      validateAttachmentBatch(attachments, files);
      const added = await Promise.all(
        files.map((file) => readAttachment(file)),
      );
      if (!mounted.current || currentTask.current?.id !== taskId) return;
      const latest = currentTask.current.attachments || [];
      validateAttachmentBatch(latest, added);
      await onChange([...latest, ...added]);
      feedback(onFeedback, `已添加 ${added.length} 个附件`);
    } catch (failure) {
      feedback(onFeedback, failure.message || "附件添加失败", true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const download = (attachment) => {
    try {
      const url = URL.createObjectURL(
        new Blob([attachmentBytes(attachment)], {
          type: "application/octet-stream",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name || "附件";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (failure) {
      feedback(onFeedback, failure.message, true);
    }
  };
  return (
    <section aria-label="任务附件" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          附件{" "}
          <span className="font-normal text-muted-foreground">
            {attachments.length}/{MAX_ATTACHMENT_COUNT}
          </span>
        </span>
        <Button
          size="small"
          icon={<FileAddOutlined />}
          loading={busy}
          disabled={
            disabled || busy || attachments.length >= MAX_ATTACHMENT_COUNT
          }
          onClick={() => input.current?.click()}
        >
          添加附件
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-label="选择任务附件"
        onChange={upload}
        disabled={disabled || busy}
      />
      <p className="text-xs text-muted-foreground">
        文件保存在任务数据中，已用 {attachmentSizeLabel(usedBytes)} /{" "}
        {attachmentSizeLabel(MAX_ATTACHMENT_BYTES)}。
      </p>
      {!attachments.length ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          添加文档或图片，把相关资料放在一起。
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={attachment.name}>
                  {attachment.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {attachmentSizeLabel(Number(attachment.size || 0))}
                </div>
              </div>
              <Tooltip title="下载附件">
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  aria-label={`下载附件 ${attachment.name}`}
                  onClick={() => download(attachment)}
                />
              </Tooltip>
              <Popconfirm
                title={`移除附件「${attachment.name}」？`}
                description="原始本机文件不会被删除。"
                okText="移除"
                cancelText="取消"
                onConfirm={async () => {
                  try {
                    await onChange(
                      (currentTask.current.attachments || []).filter(
                        (item) => item.id !== attachment.id,
                      ),
                    );
                    feedback(onFeedback, "附件已移除");
                  } catch (failure) {
                    feedback(onFeedback, failure.message || "移除失败", true);
                  }
                }}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={disabled || busy}
                  aria-label={`移除附件 ${attachment.name}`}
                />
              </Popconfirm>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TaskActivity({ task }) {
  const activity = useMemo(
    () =>
      (Array.isArray(task?.activity) ? task.activity : [])
        .filter((item) => item && typeof item.message === "string")
        .slice(-100)
        .reverse(),
    [task?.activity],
  );
  return (
    <section aria-label="任务动态" className="space-y-3">
      <p className="text-xs text-muted-foreground">
        记录任务的实际变更，保留最近 100 条。
      </p>
      {!activity.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚无操作记录。接下来的任务修改会显示在这里。"
        />
      ) : (
        <ol className="space-y-4">
          {activity.map((entry, index) => {
            const date = new Date(entry.at);
            const valid = Number.isFinite(date.getTime());
            return (
              <li key={entry.id || index} className="flex gap-3 text-sm">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-words">
                    {entry.message}
                  </p>
                  {valid && (
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={date.toISOString()}
                    >
                      {date.toLocaleString("zh-CN", { hour12: false })}
                    </time>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function inlinePreview(text) {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code
          key={index}
          className="rounded bg-muted px-1 font-mono text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      ) : part.startsWith("*") && part.endsWith("*") ? (
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        part
      ),
    );
}

export function TaskNotePreview({ value = "" }) {
  if (!value.trim())
    return (
      <p className="text-sm text-muted-foreground">
        还没有备注。切回编辑，记录更多任务信息。
      </p>
    );
  return (
    <div
      className="space-y-2 whitespace-pre-wrap break-words text-sm leading-7"
      aria-label="备注预览"
    >
      {value.split("\n").map((line, index) => {
        const heading = line.match(/^#{1,3}\s+(.+)/);
        if (heading)
          return (
            <h4 key={index} className="pt-1 text-base font-semibold">
              {inlinePreview(heading[1])}
            </h4>
          );
        if (line.startsWith("> "))
          return (
            <blockquote
              key={index}
              className="border-l-2 border-primary/40 pl-3 text-muted-foreground"
            >
              {inlinePreview(line.slice(2))}
            </blockquote>
          );
        if (line.startsWith("- "))
          return (
            <div key={index} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{inlinePreview(line.slice(2))}</span>
            </div>
          );
        return <p key={index}>{line ? inlinePreview(line) : <br />}</p>;
      })}
    </div>
  );
}

export function TaskNoteEditor({
  value = "",
  onChange,
  disabled = false,
  ariaLabel = "任务备注",
}) {
  const [mode, setMode] = useState("编辑");
  const ref = useRef(null);
  const labelId = useId();
  const format = (kind) => {
    const area = ref.current?.resizableTextArea?.textArea;
    const next = insertNoteFormat(
      value,
      area?.selectionStart,
      area?.selectionEnd,
      kind,
    );
    onChange(next.value);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };
  return (
    <section className="space-y-2" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-medium">
          备注
        </span>
        <Segmented
          size="small"
          value={mode}
          options={["编辑", "预览"]}
          onChange={setMode}
          aria-label="备注显示模式"
        />
      </div>
      {mode === "编辑" ? (
        <>
          <div
            className="flex flex-wrap items-center gap-1"
            role="toolbar"
            aria-label="备注格式工具"
          >
            {[
              { kind: "bold", label: "加粗", icon: <BoldOutlined /> },
              { kind: "italic", label: "斜体", icon: <ItalicOutlined /> },
              { kind: "heading", label: "标题", text: "H" },
              { kind: "list", label: "列表", icon: <UnorderedListOutlined /> },
              { kind: "quote", label: "引用", text: "❞" },
              { kind: "code", label: "行内代码", icon: <CodeOutlined /> },
            ].map((item) => (
              <Tooltip key={item.kind} title={item.label}>
                <Button
                  type="text"
                  size="small"
                  icon={item.icon}
                  aria-label={`备注${item.label}`}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format(item.kind)}
                >
                  {item.text}
                </Button>
              </Tooltip>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">
              Markdown 纯文本
            </span>
          </div>
          <Input.TextArea
            ref={ref}
            className="task-detail-notes"
            value={value}
            aria-label={ariaLabel}
            placeholder="添加备注… 可使用上方工具设置格式"
            autoSize={{ minRows: 4, maxRows: 16 }}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.metaKey || event.ctrlKey) &&
                ["b", "i"].includes(event.key.toLowerCase())
              ) {
                event.preventDefault();
                format(event.key.toLowerCase() === "b" ? "bold" : "italic");
              }
            }}
          />
        </>
      ) : (
        <div className="min-h-24 rounded-lg border border-border bg-muted/20 p-3">
          <TaskNotePreview value={value} />
          <p className="mt-3 text-xs text-muted-foreground">
            支持标题、加粗、斜体、列表、引用和行内代码。HTML 与链接按文本显示。
          </p>
        </div>
      )}
    </section>
  );
}
