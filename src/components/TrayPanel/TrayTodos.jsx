import { useEffect, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { startProductivitySync, useProductivityData } from '@/store/dataSync';
import { isFinished } from '@/utils/taskModel';
import { trayTodos, toggleTrayTodo } from '@/utils/trayTodos';
import './todos.css';

export default function TrayTodos() {
  const { tasks, setTasks, syncStatus, syncError, refresh } = useProductivityData();
  useEffect(() => { startProductivitySync(); }, []);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer;
    const refreshDay = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const midnight = new Date(current);
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(refreshDay, midnight.getTime() - current + 50);
    };
    refreshDay();
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  }, []);
  const items = trayTodos(tasks, now);
  const remaining = items.filter(task => !isFinished(task)).length;
  return <div className="tray-todos">
    <div className="tray-panel-summary"><span>待办</span><span>{remaining} 项未完成</span></div>
    {syncStatus === 'error' && <div className="tray-panel-error" role="alert">同步失败，修改尚未确认保存：{syncError}<button type="button" onClick={refresh}>重试</button></div>}
    {syncStatus === 'saving' && <span className="tray-todos-sync" role="status">正在保存…</span>}
    {syncStatus === 'loading' ? <div className="tray-panel-empty" role="status">正在加载待办…</div> : items.length ? (
      <ul className="tray-todos-list">
        {items.map((task, index) => {
          const done = Boolean(isFinished(task));
          const firstCompleted = done && (index === 0 || !isFinished(items[index - 1]));
          return <li key={task.id} className={firstCompleted ? 'tray-todo-completed-start' : undefined}>
            <label className={`tray-todo-row${done ? ' tray-todo-done' : ''}`}>
              <input type="checkbox" checked={done} disabled={syncStatus === 'error'}
                aria-label={`${done ? '标为未完成' : '完成'}：${task.title}`}
                onChange={() => setTasks(current => toggleTrayTodo(current, task.id))} />
              <span title={task.title}>{task.title}</span>
            </label>
          </li>;
        })}
      </ul>
    ) : syncStatus !== 'error' && <div className="tray-panel-empty"><ListTodo size={28} strokeWidth={1.5} aria-hidden="true" /><p>暂无待办</p></div>}
  </div>;
}
