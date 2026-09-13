import { useEffect, useState } from "react";
import { Button, DatePicker, Input, Select, Tag, TimePicker } from "antd";
import { FlagFilled, TagOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { taskLists, taskStatus, withLists } from "@/utils/taskModel";
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

export function TaskScheduleFields({ task, today, onChange }) {
  return (
    <section className="task-detail-section" aria-label="任务安排">
      <h3 className="task-detail-section-title">任务安排</h3>
      <div className="task-detail-form-grid">
        <Field label="状态">
          <Select
            aria-label="任务状态"
            value={taskStatus(task)}
            options={[
              { value: "pending", label: "待处理" },
              { value: "in-progress", label: "进行中" },
              { value: "done", label: "已完成" },
              { value: "abandoned", label: "已放弃" },
            ]}
            onChange={(status) =>
              onChange({ status, done: ["done", "abandoned"].includes(status) })
            }
          />
        </Field>
        <Field label="优先级">
          <Select
            aria-label="任务优先级"
            value={task.priority || "无"}
            options={[
              ["高", "high"],
              ["中", "medium"],
              ["低", "low"],
              ["无", "none"],
            ].map(([value, tone]) => ({
              value,
              label: (
                <span className="task-detail-priority-option">
                  <FlagFilled className={`task-detail-priority-${tone}`} />
                  {value === "无" ? "无优先级" : `${value}优先级`}
                </span>
              ),
            }))}
            onChange={(priority) => onChange({ priority })}
          />
        </Field>
        <Field label="日期">
          <DatePicker
            aria-label="任务日期"
            value={task.date ? dayjs(task.date) : null}
            format="YYYY-MM-DD"
            placeholder="选择日期"
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                date: value?.format("YYYY-MM-DD") || "",
                time: value ? current.time : "",
              }))
            }
          />
        </Field>
        <Field label="时间">
          <TimePicker
            aria-label="任务时间"
            value={
              task.time ? dayjs(`${task.date || today}T${task.time}`) : null
            }
            format="HH:mm"
            placeholder="全天"
            needConfirm={false}
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                time: value?.format("HH:mm") || "",
                date: value ? current.date || today : current.date,
              }))
            }
          />
        </Field>
      </div>
    </section>
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
    <section className="task-detail-section" aria-label="清单与标签">
      <h3 className="task-detail-section-title">清单与标签</h3>
      <div className="task-detail-form-grid">
        <Field label="清单">
          <Select
            aria-label="所属清单"
            showSearch
            optionFilterProp="label"
            value={task.list}
            options={["收件箱", ...lists.map(([name]) => name)].map(
              (value) => ({
                value,
                label: value,
              }),
            )}
            onChange={(value) =>
              onChange((current) => withLists(current, [value]))
            }
          />
        </Field>
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
      </div>
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
