import { normalizeSubtasks, taskLists, withLists } from "./taskModel.js";

export const TEMPLATE_STORAGE_KEY = "runproject-templates";
export const MAX_TEMPLATES = 50;
export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function normalizedState(task) {
  if (task.status === "abandoned") return "已放弃";
  if (task.done || task.status === "done") return "已完成";
  return task.status === "in-progress" ? "进行中" : "待处理";
}

/** Append only user-visible changes, so synchronization/delivery metadata cannot loop. */
export function appendTaskActivity(previousTasks, nextTasks, now = Date.now()) {
  const before = new Map(previousTasks.map((task) => [String(task.id), task]));
  const at = now instanceof Date ? now.getTime() : Number(now);
  return nextTasks.map((task) => {
    const previous = before.get(String(task.id));
    const changes = [];
    if (!previous) changes.push("创建任务");
    else {
      if (Boolean(previous.deleted) !== Boolean(task.deleted))
        changes.push(task.deleted ? "移入回收站" : "从回收站恢复");
      if (previous.title !== task.title) changes.push("修改标题");
      if ((previous.detail || "") !== (task.detail || ""))
        changes.push("更新备注");
      if (normalizedState(previous) !== normalizedState(task))
        changes.push(`状态改为${normalizedState(task)}`);
      if (
        (previous.date || "") !== (task.date || "") ||
        (previous.time || "") !== (task.time || "")
      )
        changes.push(
          task.date
            ? `安排日期：${task.date}${task.time ? ` ${task.time}` : ""}`
            : "清除安排日期",
        );
      if (!same(taskLists(previous), taskLists(task)))
        changes.push(`移至清单：${taskLists(task).join("、")}`);
      if ((previous.priority || "无") !== (task.priority || "无"))
        changes.push(`优先级改为${task.priority || "无"}`);
      if (!same(previous.tags || [], task.tags || [])) changes.push("更新标签");
      if (!same(previous.reminder || "", task.reminder || ""))
        changes.push(task.reminder ? "设置提醒" : "关闭提醒");
      if (!same(previous.repeat || "", task.repeat || ""))
        changes.push(task.repeat ? "设置重复规则" : "关闭重复规则");
      if (!same(previous.sections || {},task.sections || {})) changes.push("调整清单分组");
      if (!same(previous.comments || [],task.comments || [])) changes.push("添加任务评论");
      if ((previous.section || "") !== (task.section || ""))
        changes.push(task.section ? `移至分组：${task.section}` : "移出分组");
      if (Boolean(previous.pinned) !== Boolean(task.pinned))
        changes.push(task.pinned ? "置顶任务" : "取消置顶");
      if (
        !same(
          [previous.important, previous.urgent],
          [task.important, task.urgent],
        )
      )
        changes.push("调整四象限归属");
      const subtasks = normalizeSubtasks(task);
      if (!same(normalizeSubtasks(previous), subtasks))
        changes.push(
          `更新子任务（${subtasks.filter((item) => item.done).length}/${subtasks.length} 已完成）`,
        );
      const attachmentKeys = (value) =>
        (value.attachments || []).map(({ id, name, size }) => [id, name, size]);
      if (!same(attachmentKeys(previous), attachmentKeys(task)))
        changes.push(`更新附件（${(task.attachments || []).length} 个）`);
    }
    if (!changes.length) return task;
    const message = changes.join("；");
    const activity = (
      Array.isArray(task.activity) ? task.activity : previous?.activity || []
    )
      .filter((item) => item && typeof item.message === "string")
      .slice(-99);
    // Text fields save while typing; one editing burst should read as one action.
    const last = activity.at(-1);
    const coalesce =
      ["修改标题", "更新备注"].includes(message) &&
      last?.message === message &&
      at >= Number(last.at) &&
      at - Number(last.at) < 5000;
    if (coalesce) activity.pop();
    activity.push({ id: coalesce ? last.id : uid(), at, message });
    return { ...task, activity };
  });
}

function templateContent(task) {
  return {
    title: String(task.title || "").trim(),
    detail: String(task.detail || ""),
    priority: ["高", "中", "低", "无"].includes(task.priority)
      ? task.priority
      : "中",
    tags: Array.isArray(task.tags)
      ? task.tags.filter((tag) => typeof tag === "string")
      : [],
    subtasks: normalizeSubtasks({
      subtasks: Array.isArray(task.subtasks)
        ? task.subtasks.filter(
            (item) =>
              typeof item === "string" ||
              (item && typeof item.title === "string"),
          )
        : [],
    }).map((item) => ({ title: item.title, done: false })),
  };
}

export function makeTaskTemplate(task, name, now = Date.now()) {
  const label = String(name || "").trim();
  if (!label || label.length > 80) throw new Error("模板名称需为 1–80 个字符");
  if (!task?.title?.trim()) throw new Error("请先为任务填写标题");
  return { id: uid(), name: label, savedAt: now, task: templateContent(task) };
}

export function readTaskTemplates(storage) {
  let parsed;
  try {
    parsed = JSON.parse(storage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
  } catch {
    throw new Error(
      "模板库无法读取，原数据已保留。可检查浏览器存储，或重置模板库后重试。",
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_TEMPLATES ||
    parsed.some(
      (item) => !item || typeof (item.task?.title ?? item.title) !== "string",
    )
  )
    throw new Error("模板库格式损坏，原数据已保留。请重置模板库后重试。");
  return parsed.map((item, index) => ({
    id: String(item.id || `legacy-template-${index}`),
    name: String(item.name || item.title || item.task.title),
    savedAt: Number(item.savedAt) || 0,
    task: templateContent(item.task || item),
  }));
}

export function writeTaskTemplates(storage, templates) {
  if (templates.length > MAX_TEMPLATES)
    throw new Error(`最多保存 ${MAX_TEMPLATES} 个模板，请先删除不再使用的模板`);
  try {
    storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    throw new Error(
      "模板未保存：本机存储空间不足或访问被禁用，请释放空间后重试",
    );
  }
  return templates;
}

export function createTaskFromTemplate(
  template,
  { list = "收件箱", date = "", now = Date.now() } = {},
) {
  const content = templateContent(template.task || template);
  return withLists(
    {
      ...clone(content),
      id: uid(),
      createdAt: now,
      date,
      time: "",
      done: false,
      status: "pending",
      reminder: "",
      repeat: "",
      deleted: false,
      pinned: false,
      attachments: [],
      activity: [],
      subtasks: content.subtasks.map((item) => ({
        ...item,
        id: uid(),
        done: false,
      })),
    },
    [list],
  );
}

export function attachmentSizeLabel(size) {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAttachmentBatch(existing, files) {
  if (existing.length + files.length > MAX_ATTACHMENT_COUNT)
    throw new Error(`每个任务最多添加 ${MAX_ATTACHMENT_COUNT} 个附件`);
  const total = [...existing, ...files].reduce(
    (sum, file) => sum + Number(file.size || 0),
    0,
  );
  if (total > MAX_ATTACHMENT_BYTES)
    throw new Error("每个任务的附件总大小不能超过 1 MB，请压缩文件后重试");
  if (files.some((file) => !Number.isFinite(file.size) || file.size < 0))
    throw new Error("无法读取文件大小，请重新选择附件");
}

export function readAttachment(file, FileReaderClass = globalThis.FileReader) {
  return new Promise((resolve, reject) => {
    const reader = new FileReaderClass();
    reader.onerror = () =>
      reject(new Error(`无法读取「${file.name}」，请检查文件是否仍存在`));
    reader.onabort = () => reject(new Error("附件读取已取消"));
    reader.onload = () =>
      resolve({
        id: uid(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        addedAt: Date.now(),
        dataUrl: reader.result,
      });
    reader.readAsDataURL(file);
  });
}

export function attachmentBytes(attachment) {
  const match =
    typeof attachment.dataUrl === "string" &&
    attachment.dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/=\s]*)$/);
  if (!match) throw new Error("附件数据缺失或损坏，无法下载");
  try {
    const binary = atob(match[1]);
    if (binary.length !== attachment.size) throw new Error("size mismatch");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("附件数据损坏，无法下载");
  }
}

/** Return plain text only. The preview renderer creates React nodes, never raw HTML. */
export function insertNoteFormat(value, selectionStart, selectionEnd, kind) {
  const start = Math.max(
    0,
    Math.min(value.length, selectionStart ?? value.length),
  );
  const end = Math.max(start, Math.min(value.length, selectionEnd ?? start));
  const selected = value.slice(start, end);
  const formats = {
    bold: ["**", "**", "加粗文字"],
    italic: ["*", "*", "斜体文字"],
    code: ["`", "`", "代码"],
    heading: ["## ", "", "标题"],
    list: ["- ", "", "列表项"],
    quote: ["> ", "", "引用文字"],
  };
  if (!formats[kind])
    return { value, selectionStart: start, selectionEnd: end };
  const [rawPrefix, suffix, placeholder] = formats[kind];
  const lineFormat = ["heading", "list", "quote"].includes(kind);
  const prefix =
    lineFormat && start > 0 && value[start - 1] !== "\n"
      ? `\n${rawPrefix}`
      : rawPrefix;
  const content = selected || placeholder;
  const tail =
    lineFormat && end < value.length && value[end] !== "\n" ? `\n` : "";
  return {
    value:
      value.slice(0, start) +
      prefix +
      content +
      suffix +
      tail +
      value.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + content.length,
  };
}
