import { isFinished } from "./taskModel.js";

export function reminderTime(task) {
  const value = task?.reminder;
  if (typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))?$/,
  );
  if (!match || match[0] !== value) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    zone,
    ,
    offsetHour,
    offsetMinute,
  ] = match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText || "0",
  ].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number(offsetHour || 0) > 23 ||
    Number(offsetMinute || 0) > 59
  )
    return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  if (!zone) {
    // Local wall-clock times inside a daylight-saving gap must not silently move forward.
    const parsed = new Date(time);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() + 1 !== month ||
      parsed.getDate() !== day ||
      parsed.getHours() !== hour ||
      parsed.getMinutes() !== minute ||
      parsed.getSeconds() !== second
    )
      return null;
  }
  return time;
}
export function reminderKey(task) {
  const time = reminderTime(task);
  return time === null ? "" : String(time);
}
const active = (task) => !task.deleted && !isFinished(task);
export function pendingReminders(tasks, now = Date.now()) {
  return tasks
    .filter((task) => {
      const time = reminderTime(task);
      return (
        active(task) &&
        time !== null &&
        time <= now &&
        task.reminderAcknowledged !== String(time)
      );
    })
    .sort((a, b) => reminderTime(a) - reminderTime(b));
}
export function newReminders(tasks, now = Date.now()) {
  return pendingReminders(tasks, now).filter(
    (task) => task.reminderNotified !== reminderKey(task),
  );
}
export function upcomingReminders(tasks, now = Date.now()) {
  return tasks
    .filter((task) => {
      const time = reminderTime(task);
      return active(task) && time !== null && time > now;
    })
    .sort((a, b) => reminderTime(a) - reminderTime(b));
}
// Capture the reminder the user actually saw, not just its task ID. A concurrent
// reschedule must remain unread and must not be postponed/completed by an old card.
export function reminderSnapshot(tasks) {
  return new Map(
    tasks
      .map((task) => [String(task.id), reminderKey(task)])
      .filter(([, key]) => key),
  );
}
export function updateReminderTasks(tasks, keys, updater) {
  let changed = false;
  const next = tasks.map((task) => {
    const key = reminderKey(task);
    if (!active(task) || !key || keys.get(String(task.id)) !== key) return task;
    const updated = updater(task, key);
    changed ||= updated !== task;
    return updated;
  });
  return changed ? next : tasks;
}
export function acknowledgeReminders(tasks, keys) {
  return updateReminderTasks(tasks, keys, (task, key) =>
    task.reminderAcknowledged === key
      ? task
      : { ...task, reminderAcknowledged: key },
  );
}
export function markRemindersNotified(tasks, keys) {
  return updateReminderTasks(tasks, keys, (task, key) =>
    task.reminderNotified === key ? task : { ...task, reminderNotified: key },
  );
}
export function claimReminderNotifications(
  tasks,
  observedKeys,
  now = Date.now(),
) {
  const notifications = newReminders(tasks, now).filter(
    (task) => observedKeys.get(String(task.id)) === reminderKey(task),
  );
  return {
    tasks: markRemindersNotified(tasks, reminderSnapshot(notifications)),
    notifications,
  };
}
export function localDateTime(time = Date.now()) {
  const d = new Date(time);
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function setTaskReminder(task, value) {
  if (
    typeof value !== "string" ||
    (value && reminderTime({ reminder: value }) === null)
  )
    throw new Error("请选择有效的提醒日期和时间");
  if (value === task.reminder) return task;
  // Reformatting the same instant (for example an imported offset timestamp)
  // does not create a second delivery of the same reminder.
  if (value && reminderKey(task) === reminderKey({ reminder: value }))
    return { ...task, reminder: value };
  return {
    ...task,
    reminder: value,
    reminderAcknowledged: "",
    reminderNotified: "",
  };
}
// Timers may pause while the computer sleeps or the page is cached. Re-read the
// wall clock on recovery instead of incrementing a counter from an old timestamp.
export function watchReminderClock(
  update,
  {
    windowTarget = globalThis.window,
    documentTarget = globalThis.document,
    readTime = Date.now,
    setTimer = setInterval,
    clearTimer = clearInterval,
  } = {},
) {
  const refresh = () => update(readTime());
  const visible = () => {
    if (!documentTarget?.hidden) refresh();
  };
  const timer = setTimer(refresh, 15000);
  windowTarget?.addEventListener("focus", refresh);
  windowTarget?.addEventListener("pageshow", refresh);
  documentTarget?.addEventListener("visibilitychange", visible);
  refresh();
  return () => {
    clearTimer(timer);
    windowTarget?.removeEventListener("focus", refresh);
    windowTarget?.removeEventListener("pageshow", refresh);
    documentTarget?.removeEventListener("visibilitychange", visible);
  };
}
