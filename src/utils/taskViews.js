import { dateKey, isFinished, shiftDay } from "./taskModel.js";
import { listSections, taskSection } from "./taskOrganization.js";

export function nextTaskSelection(
  selectedId,
  visibleTasks,
  tasks,
  viewChanged = false,
) {
  if (visibleTasks.some((task) => task.id === selectedId)) return selectedId;
  // Background changes should not replace an editor the user is working in.
  if (!viewChanged && tasks.some((task) => task.id === selectedId))
    return selectedId;
  return visibleTasks[0]?.id ?? null;
}

export function shiftCalendarAnchor(anchor, view, direction) {
  if (view !== "月")
    return shiftDay(
      anchor,
      direction * ({ 日: 1, 周: 7, 议程: 30 }[view] || 1),
    );
  const value = new Date(`${anchor}T12:00:00`);
  const day = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + direction);
  const last = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.min(day, last));
  return dateKey(value);
}

// User section names and status groups live in separate namespaces, including
// legacy section names that are no longer accepted when creating new groups.
export function taskGroups(
  visibleTasks,
  { lists = [], tasks = visibleTasks, listName = null } = {},
) {
  const groups = new Map();
  const sectionGroup = (section) => {
    const key = `section:${section}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        section,
        label: section
          ? ["已完成", "已放弃", "未分组"].includes(section)
            ? `${section}（分组）`
            : section
          : "未分组",
        finished: false,
        items: [],
      });
    return groups.get(key);
  };
  if (listName) listSections(lists, tasks, listName).forEach(sectionGroup);
  for (const task of visibleTasks.filter((task) => !isFinished(task))) {
    sectionGroup(taskSection(task, listName || task.list) || "").items.push(
      task,
    );
  }
  for (const [status, label] of [
    ["done", "已完成"],
    ["abandoned", "已放弃"],
  ]) {
    const items = visibleTasks.filter(
      (task) =>
        isFinished(task) &&
        (task.status === "abandoned") === (status === "abandoned"),
    );
    if (items.length)
      groups.set(`status:${status}`, {
        key: `status:${status}`,
        section: null,
        label,
        finished: true,
        items,
      });
  }
  return [...groups.values()];
}

export function collectTaskActivity(tasks, limit = 100) {
  return tasks
    .flatMap((task) =>
      (Array.isArray(task.activity) ? task.activity : [])
        .filter((event) => event && Number.isFinite(Number(event.at)))
        .map((event) => ({
          ...event,
          id: `${task.id}:${event.id}`,
          message: `${task.title} · ${event.message}`,
        })),
    )
    .sort((a, b) => Number(a.at) - Number(b.at))
    .slice(-limit);
}
