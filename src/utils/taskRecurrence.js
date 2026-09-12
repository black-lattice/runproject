// Recurrence is a completion transition, never a background job or a load-time backfill.
// Keep this transformation aligned with src-tauri/src/task_lifecycle.rs.
const DAY = 86_400_000;
const rules = new Set(["每天", "每周一", "每周", "每月"]);
const metadata = [
  "recurrenceRootId",
  "recurrenceIndex",
  "recurrenceNextId",
  "recurrenceDay",
  "recurrenceScheduledDate",
];
const pad = (value) => String(value).padStart(2, "0");
const key = (date) =>
  `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && key(d) === value ? d : null;
}
function shifted(value, days) {
  const d = new Date(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function monthDay(year, month, day) {
  // setUTCFullYear avoids Date.UTC's special handling of years 0–99.
  const last = new Date(0);
  last.setUTCFullYear(year, month + 1, 0);
  const result = new Date(last);
  result.setUTCDate(Math.min(day, last.getUTCDate()));
  return result;
}
function anchorDay(task, source) {
  return task.recurrenceScheduledDate === task.date &&
    Number.isInteger(task.recurrenceDay) &&
    task.recurrenceDay >= 1 &&
    task.recurrenceDay <= 31
    ? task.recurrenceDay
    : source.getUTCDate();
}
export function nextOccurrenceDate(task, today = localToday()) {
  const current = date(today);
  if (!current || !rules.has(task.repeat)) return "";
  const source = date(task.date) || current;
  let next;
  if (task.repeat === "每月") {
    const day = anchorDay(task, source);
    const offset = Math.max(
      1,
      (current.getUTCFullYear() - source.getUTCFullYear()) * 12 +
        current.getUTCMonth() -
        source.getUTCMonth(),
    );
    next = monthDay(
      source.getUTCFullYear(),
      source.getUTCMonth() + offset,
      day,
    );
    if (next < current)
      next = monthDay(next.getUTCFullYear(), next.getUTCMonth() + 1, day);
  } else if (task.repeat === "每周一") {
    next = shifted(source, (8 - source.getUTCDay()) % 7 || 7);
    if (next < current)
      next = shifted(next, Math.ceil((current - next) / (7 * DAY)) * 7);
  } else {
    const interval = task.repeat === "每周" ? 7 : 1;
    next = shifted(
      source,
      Math.max(1, Math.ceil((current - source) / (interval * DAY))) * interval,
    );
  }
  return next.getUTCFullYear() <= 9999 ? key(next) : "";
}
export function resetTaskRecurrence(task) {
  const result = { ...task };
  for (const field of metadata) delete result[field];
  return result;
}
const completed = (task) =>
  task?.status !== "abandoned" &&
  (task?.done === true || task?.status === "done");
function childId(root, index) {
  const encoded = [...new TextEncoder().encode(String(root))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `recurrence:${encoded}:${index}`;
}
function resetSubtasks(items, id) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const next = typeof item === "string" ? { title: item } : { ...item };
    next.id = `${id}:sub:${index}`;
    next.done = false;
    if ("status" in next) next.status = "pending";
    delete next.completedAt;
    if (Array.isArray(next.subtasks))
      next.subtasks = resetSubtasks(next.subtasks, next.id);
    return next;
  });
}
function nextReminder(reminder, sourceDate, targetDate) {
  if (
    typeof reminder !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      reminder,
    ) ||
    !Number.isFinite(Date.parse(reminder))
  )
    return "";
  const reminderDate = date(reminder.slice(0, 10));
  if (!reminderDate) return "";
  const moved = shifted(reminderDate, (date(targetDate) - sourceDate) / DAY);
  return moved.getUTCFullYear() > 0 && moved.getUTCFullYear() <= 9999
    ? key(moved) + reminder.slice(10)
    : "";
}
export function applyTaskRecurrence(
  previousTasks,
  nextTasks,
  { today = localToday(), now = Date.now() } = {},
) {
  const previous = new Map(
    previousTasks.map((task) => [String(task.id), task]),
  );
  const ids = new Set(nextTasks.map((task) => String(task.id)));
  const additions = [];
  const result = nextTasks.map((input) => {
    const before = previous.get(String(input.id));
    // The link is a durable tombstone: undo or deleting the next instance never regenerates it.
    let task =
      before?.recurrenceNextId &&
      input.recurrenceNextId !== before.recurrenceNextId
        ? { ...input, recurrenceNextId: before.recurrenceNextId }
        : input;
    if (
      !before ||
      completed(before) ||
      before.deleted ||
      !completed(task) ||
      task.deleted ||
      task.recurrenceNextId ||
      !rules.has(task.repeat)
    )
      return task;
    const nextDate = nextOccurrenceDate(task, today);
    if (!nextDate) return task;
    const root = task.recurrenceRootId ?? String(task.id);
    const index =
      Number.isSafeInteger(task.recurrenceIndex) && task.recurrenceIndex >= 0
        ? task.recurrenceIndex
        : 0;
    const id = childId(root, index + 1);
    task = { ...task, recurrenceNextId: id };
    if (ids.has(id)) return task;
    const source = date(task.date) || date(today);
    const next = {
      ...resetTaskRecurrence(task),
      id,
      date: nextDate,
      done: false,
      status: "pending",
      deleted: false,
      createdAt: now,
      subtasks: resetSubtasks(task.subtasks, id),
      recurrenceRootId: root,
      recurrenceIndex: index + 1,
      recurrenceDay: anchorDay(task, source),
      recurrenceScheduledDate: nextDate,
      reminder: nextReminder(task.reminder, source, nextDate),
      reminderNotified: "",
      reminderAcknowledged: "",
    };
    for (const field of ["completedAt", "deletedAt", "abandonedAt"])
      delete next[field];
    additions.push(next);
    ids.add(id);
    return task;
  });
  return additions.length ? [...additions, ...result] : result;
}
