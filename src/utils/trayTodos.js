import { isFinished } from './taskModel.js';

const timestamp = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const completedTime = task => Math.max(timestamp(task.completedAt),
  ...(task.activity || []).filter(item => item.message?.split('；').includes('状态改为已完成'))
    .map(item => timestamp(item.at)));

export function trayTodos(tasks, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const today = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  // Older versions could create a same-day successor when completing an overdue task.
  const deferred = new Set(tasks.filter(task => isFinished(task)
    && completedTime(task) >= start.getTime() && completedTime(task) < end.getTime())
    .map(task => task.recurrenceNextId).filter(Boolean));
  return tasks.filter(task => {
    if (task.deleted || task.status === 'abandoned') return false;
    if (!isFinished(task)) {
      if (!task.repeat) return true;
      return !(task.date > today || deferred.has(task.id));
    }
    const at = completedTime(task);
    return at > 0 && at >= start.getTime() && at < end.getTime();
  }).sort((a, b) => Number(Boolean(isFinished(a))) - Number(Boolean(isFinished(b)))
    || (isFinished(a) ? completedTime(b) - completedTime(a) : 0));
}
export function toggleTrayTodo(tasks, id, now = Date.now()) {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const completedAt = Math.min(end.getTime() - 1, tasks.reduce((latest, task) => {
    const at = completedTime(task);
    return at <= now ? Math.max(latest, at + 1) : latest;
  }, now));
  return tasks.map(task => {
    if (task.id !== id || task.deleted || task.status === 'abandoned') return task;
    const done = !isFinished(task);
    const next = { ...task, done, status: done ? 'done' : 'pending' };
    if (done) next.completedAt = completedAt;
    else delete next.completedAt;
    return next;
  });
}
