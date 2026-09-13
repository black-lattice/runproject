import { taskLists } from "./taskModel.js";

const text = (value, fallback = "") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

export function exportTaskStatus(task) {
  if (task.status === "abandoned") return "已放弃";
  if (task.done || task.status === "done") return "已完成";
  return task.status === "in-progress" ? "进行中" : "待处理";
}

/** Copy only readable fields. File bodies and mutable task references never enter an export. */
export function createTaskExportSnapshot({
  title = "任务导出",
  tasks = [],
  now = Date.now(),
} = {}) {
  const timestamp = new Date(now);
  return {
    title: text(title, "任务导出") || "任务导出",
    capturedAt: Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString()
      : new Date().toISOString(),
    tasks: tasks
      .filter((task) => task && typeof task === "object")
      .map((task, index) => ({
        id: text(task.id, `export-${index}`),
        title: text(task.title, "未命名任务") || "未命名任务",
        status: exportTaskStatus(task),
        deleted: Boolean(task.deleted),
        date: text(task.date),
        time: text(task.time),
        lists: taskLists({
          list: text(task.list, "收件箱"),
          lists: Array.isArray(task.lists)
            ? task.lists.filter((item) => typeof item === "string")
            : undefined,
          categories: Array.isArray(task.categories)
            ? task.categories.filter((item) => typeof item === "string")
            : undefined,
        }),
        priority: text(task.priority, "无") || "无",
        tags: Array.isArray(task.tags)
          ? task.tags.filter((tag) => typeof tag === "string")
          : [],
        detail: text(task.detail),
        reminder: text(task.reminder),
        repeat: text(task.repeat),
        subtasks: (Array.isArray(task.subtasks) ? task.subtasks : [])
          .filter(
            (item) =>
              typeof item === "string" ||
              (item && typeof item.title === "string"),
          )
          .map((item) => ({
            title: typeof item === "string" ? item : item.title,
            done: typeof item === "object" && Boolean(item.done),
          })),
        attachments: (Array.isArray(task.attachments) ? task.attachments : [])
          .filter((item) => item && typeof item.name === "string")
          .map((item) => item.name),
        comments: (Array.isArray(task.comments) ? task.comments : [])
          .filter((item) => item && typeof item.text === "string")
          .map((item) => ({ text: item.text, at: text(item.at) })),
      })),
  };
}

export function exportSnapshotTime(snapshot) {
  return new Date(snapshot.capturedAt).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function exportTaskDate(task) {
  return task.date
    ? `${task.date}${task.time ? ` ${task.time}` : " · 全天"}`
    : task.time
      ? `未安排日期 · ${task.time}`
      : "未安排日期";
}

export function taskExportText(snapshot) {
  const lines = [
    snapshot.title,
    `导出时间：${exportSnapshotTime(snapshot)}`,
    `范围：打开导出窗口时的当前视图快照，共 ${snapshot.tasks.length} 项任务。`,
    "附件仅包含名称，不包含文件内容；任务动态不包含在导出中。",
    "",
  ];
  for (const [index, task] of snapshot.tasks.entries()) {
    lines.push(
      `${index + 1}. ${task.title}`,
      `状态：${task.status}${task.deleted ? "（回收站）" : ""}`,
      `日期：${exportTaskDate(task)}`,
      `清单：${task.lists.join("、")}`,
      `优先级：${task.priority}`,
      `标签：${task.tags.length ? task.tags.map((tag) => `#${tag}`).join(" ") : "无"}`,
    );
    if (task.reminder) lines.push(`提醒：${task.reminder}`);
    if (task.repeat) lines.push(`重复：${task.repeat}`);
    lines.push("备注：", task.detail || "无");
    if (task.subtasks.length)
      lines.push(
        "子任务：",
        ...task.subtasks.map(
          (item) => `  [${item.done ? "x" : " "}] ${item.title}`,
        ),
      );
    if (task.attachments.length)
      lines.push(
        "附件名称：",
        ...task.attachments.map((name) => `  - ${name}`),
      );
    if (task.comments.length)
      lines.push("评论：", ...task.comments.map((item) => `  - ${item.text}`));
    lines.push("");
  }
  if (!snapshot.tasks.length) lines.push("当前视图没有任务。");
  return lines.join("\n");
}
