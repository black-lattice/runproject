import { Button, Select } from "antd";
import { taskLists } from "@/utils/taskModel";
import { nextOccurrenceDate } from "@/utils/taskRecurrence";
import { TaskSectionSelect } from "./TaskOrganization";
import { ReminderEditor } from "./TaskReminders";

function Field({ label, children }) {
  return (
    <div className="task-detail-field">
      <span className="task-detail-field-label">{label}</span>
      {children}
    </div>
  );
}

export function TaskReminderFields({ task, tasks, today, onChange, onReveal }) {
  return (
    <section className="task-detail-section" aria-label="提醒与重复">
      <h3 className="task-detail-section-title">提醒与重复</h3>
      <ReminderEditor task={task} onChange={onChange} />
      <Field label="重复规则">
        <Select
          aria-label="重复规则"
          value={task.repeat || ""}
          options={["", "每天", "每周一", "每周", "每月"].map((value) => ({
            value,
            label: value || "不重复",
          }))}
          onChange={(repeat) =>
            onChange((current) => ({
              ...current,
              repeat,
              date: repeat ? current.date || today : current.date,
            }))
          }
        />
      </Field>
      {task.repeat && (
        <p className="task-detail-help">
          完成后创建下一次：{nextOccurrenceDate(task, today)}。
          取消本次完成不会删除已生成的后续任务。
        </p>
      )}
      {task.recurrenceNextId &&
        (tasks.some(
          (item) =>
            String(item.id) === String(task.recurrenceNextId) && !item.deleted,
        ) ? (
          <Button size="small" onClick={() => onReveal(task.recurrenceNextId)}>
            查看下次任务
          </Button>
        ) : (
          <p className="task-detail-help">下次任务已移除，不会重复生成。</p>
        ))}
    </section>
  );
}

export function TaskOrganizationFields({
  task,
  tasks,
  lists,
  currentList,
  onChange,
  onTasksChange,
  onDataChange,
}) {
  const sectionList = taskLists(task).includes(currentList)
    ? currentList
    : task.list;
  return (
    <section className="task-detail-section" aria-label="任务分组">
      <h3 className="task-detail-section-title">任务分组</h3>
      <Field label="分组">
        <TaskSectionSelect
          task={task}
          listName={sectionList}
          lists={lists}
          tasks={tasks}
          onChange={onTasksChange}
          onDataChange={onDataChange}
        />
      </Field>
    </section>
  );
}
