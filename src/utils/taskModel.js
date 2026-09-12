// Shared task rules. Plain functions also cover records written by MCP and older versions.
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
export function taskLists(task) {
  const values =
    Array.isArray(task.lists) && task.lists.length
      ? task.lists
      : Array.isArray(task.categories) && task.categories.length
        ? task.categories
        : [task.list || "收件箱"];
  return [...new Set(values.filter(Boolean))];
}
export function withLists(task, values) {
  const lists = [...new Set(values.filter(Boolean))];
  if (!lists.length) lists.push("收件箱");
  return { ...task, list: lists[0], lists, categories: lists };
}
export function isFinished(task) {
  return task.done || ["done", "abandoned"].includes(task.status);
}
export function parseQuickTask(raw, today, defaultDate = "") {
  let title = raw.trim(),
    date = defaultDate,
    time = "";
  const day = title.match(/今天|明天|后天/);
  if (day) {
    date = shiftDay(today, { 今天: 0, 明天: 1, 后天: 2 }[day[0]]);
    title = title.replace(day[0], "");
  }
  const match = title.match(
    /(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/,
  );
  if (match) {
    let hour = Number(match[2]),
      minute = Number(match[3] ?? match[4] ?? 0);
    const period = match[1];
    const valid =
      (period ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23) &&
      minute <= 59;
    if (valid) {
      if (["下午", "晚上", "中午"].includes(period) && hour < 12) hour += 12;
      if (period === "上午" && hour === 12) hour = 0;
      time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      title = title.replace(match[0], "");
      date ||= today;
    }
  }
  return {
    title: title.replace(/^[，,：:\s]+|[，,：:\s]+$/g, "").trim(),
    date,
    time,
  };
}
export function searchTasks(tasks, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return tasks.filter(
    (t) =>
      !t.deleted &&
      `${t.title ?? ""} ${t.detail ?? ""} ${taskLists(t).join(" ")} ${(t.tags || []).join(" ")}`
        .toLocaleLowerCase()
        .includes(needle),
  );
}
export function selectTasks(
  tasks,
  {
    nav = "all",
    day = dateKey(),
    priority = "全部",
    tag = "",
    hideCompleted = false,
    sort = "默认排序",
  } = {},
) {
  return tasks
    .filter((t) => {
      if (nav === "trash") return Boolean(t.deleted);
      if (t.deleted) return false;
      if (hideCompleted && nav !== "completed" && isFinished(t)) return false;
      if (
        priority !== "全部" &&
        (priority === "无"
          ? Boolean(t.priority) && t.priority !== "无"
          : t.priority !== priority)
      )
        return false;
      if (tag && !(t.tags || []).includes(tag)) return false;
      if (nav === "today") return t.date === day;
      if (nav === "tomorrow") return t.date === shiftDay(day, 1);
      if (nav === "upcoming")
        return t.date >= day && t.date <= shiftDay(day, 6);
      if (nav === "overdue") return t.date && t.date < day && !isFinished(t);
      if (nav === "completed") return isFinished(t);
      if (nav === "inbox")
        return taskLists(t).includes("收件箱") && !isFinished(t);
      if (nav.startsWith("list:")) return taskLists(t).includes(nav.slice(5));
      return true;
    })
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sort === "优先级")
        return (
          ({ 高: 0, 中: 1, 低: 2 }[a.priority] ?? 3) -
          ({ 高: 0, 中: 1, 低: 2 }[b.priority] ?? 3)
        );
      if (sort === "时间")
        return `${a.date || "9999"} ${a.time || "99:99"}`.localeCompare(
          `${b.date || "9999"} ${b.time || "99:99"}`,
        );
      return 0;
    });
}
export const QUADRANTS = ["重要且紧急", "重要不紧急", "不重要但紧急", "其他"];
export function quadrantOf(task, today = dateKey()) {
  const important = task.important ?? task.priority === "高";
  const urgent = task.urgent ?? Boolean(task.date && task.date <= today);
  return QUADRANTS[important ? (urgent ? 0 : 1) : urgent ? 2 : 3];
}
export function moveTaskTo(task, target, today = dateKey()) {
  if (target.startsWith("date:")) return { ...task, date: target.slice(5) };
  if (QUADRANTS.includes(target)) {
    const index = QUADRANTS.indexOf(target);
    return {
      ...task,
      important: index < 2,
      urgent: index === 0 || index === 2,
    };
  }
  const states = {
    待处理: "pending",
    进行中: "in-progress",
    已完成: "done",
    已放弃: "abandoned",
  };
  if (states[target])
    return {
      ...task,
      status: states[target],
      done: ["done", "abandoned"].includes(states[target]),
    };
  if (target === "未安排") return { ...task, date: "", time: "" };
  if (target === "今天") return { ...task, date: today };
  if (target === "明天") return { ...task, date: shiftDay(today, 1) };
  if (target === "以后") return { ...task, date: shiftDay(today, 2) };
  return task;
}
export function toolGroups(tasks, mode, today = dateKey()) {
  if (mode === "matrix")
    return QUADRANTS.map((label) => [
      label,
      tasks.filter((t) => !isFinished(t) && quadrantOf(t, today) === label),
    ]);
  if (mode === "kanban")
    return ["待处理", "进行中", "已完成", "已放弃"].map((label) => [
      label,
      tasks.filter((t) =>
        label === "已放弃"
          ? t.status === "abandoned"
          : label === "已完成"
            ? isFinished(t) && t.status !== "abandoned"
            : label === "进行中"
              ? !isFinished(t) && t.status === "in-progress"
              : !isFinished(t) && t.status !== "in-progress",
      ),
    ]);
  const pending = tasks.filter((t) => !isFinished(t));
  return [
    ["逾期", pending.filter((t) => t.date && t.date < today)],
    ["今天", pending.filter((t) => t.date === today)],
    ["明天", pending.filter((t) => t.date === shiftDay(today, 1))],
    ["以后", pending.filter((t) => t.date > shiftDay(today, 1))],
    ["未安排", pending.filter((t) => !t.date)],
  ];
}
export function normalizeSubtasks(task) {
  return (task.subtasks || []).map((item, index) =>
    typeof item === "string"
      ? { id: `legacy-${index}`, title: item, done: false }
      : { ...item, id: item.id || `legacy-${index}` },
  );
}
export function changeList(tasks, previous, next) {
  return tasks.map((task) => {
    if (!taskLists(task).includes(previous)) return task;
    const result = withLists(
      task,
      taskLists(task).flatMap((label) =>
        label === previous ? (next ? [next] : []) : [label],
      ),
    );
    if (task.sections && typeof task.sections === "object") {
      const sections = { ...task.sections };
      if (Object.hasOwn(sections, previous)) {
        const value = sections[previous];
        delete sections[previous];
        if (next) sections[next] = value;
      }
      result.sections = sections;
    }
    return result;
  });
}
