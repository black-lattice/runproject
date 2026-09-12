import { isFinished } from "./taskModel.js";
export function reminderTime(task) {
  const value = task?.reminder;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    )
  )
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function reminderKey(task) {
  const time = reminderTime(task);
  return time === null ? "" : String(time);
}
export function pendingReminders(tasks, now = Date.now()) {
  return tasks
    .filter(
      (task) =>
        !task.deleted &&
        !isFinished(task) &&
        reminderTime(task) !== null &&
        reminderTime(task) <= now &&
        task.reminderAcknowledged !== reminderKey(task),
    )
    .sort((a, b) => reminderTime(a) - reminderTime(b));
}
export function newReminders(tasks, now = Date.now()) {
  return pendingReminders(tasks, now).filter(
    (task) => task.reminderNotified !== reminderKey(task),
  );
}
export function upcomingReminders(tasks, now = Date.now()) {
  return tasks
    .filter(
      (task) => !task.deleted && !isFinished(task) && reminderTime(task) > now,
    )
    .sort((a, b) => reminderTime(a) - reminderTime(b));
}
export function acknowledgeReminders(tasks, ids) {
  const selected = new Set(ids.map(String));
  return tasks.map((task) =>
    selected.has(String(task.id))
      ? { ...task, reminderAcknowledged: reminderKey(task) }
      : task,
  );
}
export function markRemindersNotified(tasks, keys) {
  return tasks.map((task) =>
    keys.get(String(task.id)) === reminderKey(task)
      ? { ...task, reminderNotified: reminderKey(task) }
      : task,
  );
}
export function localDateTime(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function setTaskReminder(task, value) {
  if (value && reminderTime({ reminder: value }) === null)
    throw new Error("请选择有效的提醒日期和时间");
  return {
    ...task,
    reminder: value,
    reminderAcknowledged: "",
    reminderNotified: "",
  };
}
