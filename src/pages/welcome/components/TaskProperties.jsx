import { useEffect, useState } from "react";
import { Button, Input, Select, Tag } from "antd";
import { TagOutlined } from "@ant-design/icons";
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
  const [tagDraft, setTagDraft] = useState("");
  useEffect(() => setTagDraft(""), [task.id]);
  const sectionList = taskLists(task).includes(currentList)
    ? currentList
    : task.list;
  return (
    <section className="task-detail-section" aria-label="分组与标签">
      <h3 className="task-detail-section-title">分组与标签</h3>
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
      <Field label="标签">
        {task.tags?.length > 0 && (
          <div className="task-detail-tags">
            {task.tags.map((tag) => (
              <Tag
                key={tag}
                closable
                onClose={() =>
                  onChange((current) => ({
                    ...current,
                    tags: (current.tags || []).filter((item) => item !== tag),
                  }))
                }
              >
                #{tag}
              </Tag>
            ))}
          </div>
        )}
        <Input
          aria-label="添加标签"
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          prefix={<TagOutlined className="text-muted-foreground" />}
          placeholder="添加标签"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.key !== "Enter") return;
            const tag = event.currentTarget.value
              .trim()
              .replace(/^#/, "")
              .trim();
            if (!tag) return;
            event.preventDefault();
            onChange((current) => ({
              ...current,
              tags: [...new Set([...(current.tags || []), tag])],
            }));
            setTagDraft("");
          }}
        />
      </Field>
    </section>
  );
}
