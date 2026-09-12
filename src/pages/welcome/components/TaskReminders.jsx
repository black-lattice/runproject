import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Tabs } from "antd";
import {
  pendingReminders,
  upcomingReminders,
  reminderTime,
  localDateTime,
  setTaskReminder,
  acknowledgeReminders,
} from "@/utils/taskReminders";
export function ReminderEditor({ task, onChange }) {
  const valid = !task.reminder || reminderTime(task) !== null;
  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <label htmlFor="task-reminder-at">提醒时间</label>
        <Input
          id="task-reminder-at"
          type="datetime-local"
          aria-label="任务提醒时间"
          style={{ width: 220 }}
          value={
            valid && task.reminder ? localDateTime(reminderTime(task)) : ""
          }
          onChange={(event) =>
            onChange((current) => setTaskReminder(current, event.target.value))
          }
        />
      </div>
      {!valid && (
        <Alert
          type="warning"
          showIcon
          title={`旧提醒“${task.reminder}”无法识别，请重新选择时间。`}
        />
      )}
      <p className="text-xs text-muted-foreground">
        应用打开期间显示站内提醒；离开首页仍可提醒，恢复窗口时会检查错过的提醒。
      </p>
      {task.reminder && (
        <Button
          size="small"
          onClick={() => onChange((current) => setTaskReminder(current, ""))}
        >
          取消提醒
        </Button>
      )}
    </div>
  );
}
export function NotificationPanel({
  open,
  onClose,
  tasks,
  setTasks,
  onSelect,
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [open]);
  const due = pendingReminders(tasks, now),
    upcoming = upcomingReminders(tasks, now);
  const list = (items, pending) =>
    items.length ? (
      <div className="space-y-3">
        {items.map((task) => (
          <article
            key={task.id}
            className="rounded-lg border border-border p-3 space-y-2"
          >
            <button
              className="text-left font-medium break-words text-foreground"
              onClick={() => {
                onSelect(task.id);
                onClose();
              }}
            >
              {task.title}
            </button>
            <p className="text-xs text-muted-foreground">
              {new Date(reminderTime(task)).toLocaleString("zh-CN")}
            </p>
            <div className="flex flex-wrap gap-2">
              {pending && (
                <>
                  <Button
                    size="small"
                    onClick={() =>
                      setTasks((current) =>
                        acknowledgeReminders(current, [task.id]),
                      )
                    }
                  >
                    知道了
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id
                            ? setTaskReminder(
                                item,
                                localDateTime(Date.now() + 10 * 60000),
                              )
                            : item,
                        ),
                      )
                    }
                  >
                    10 分钟后提醒
                  </Button>
                </>
              )}
              <Button
                size="small"
                onClick={() =>
                  setTasks((current) =>
                    current.map((item) =>
                      item.id === task.id
                        ? { ...item, done: true, status: "done" }
                        : item,
                    ),
                  )
                }
              >
                完成任务
              </Button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={pending ? "没有待处理提醒" : "还没有即将到期的提醒"}
      />
    );
  return (
    <Drawer title="任务通知" open={open} onClose={onClose} size={420}>
      <Alert
        type="info"
        showIcon
        title="站内提醒"
        description="完全退出应用后不发送提醒，下次打开会补充检查；提醒记录在任务中保存。"
        className="mb-4"
      />
      {due.length > 0 && (
        <Button
          className="mb-3"
          onClick={() =>
            setTasks((current) =>
              acknowledgeReminders(
                current,
                due.map((t) => t.id),
              ),
            )
          }
        >
          全部标为已读（{due.length}）
        </Button>
      )}
      <Tabs
        items={[
          {
            key: "pending",
            label: `待处理 ${due.length}`,
            children: list(due, true),
          },
          {
            key: "upcoming",
            label: `即将到期 ${upcoming.length}`,
            children: list(upcoming, false),
          },
        ]}
      />
    </Drawer>
  );
}
