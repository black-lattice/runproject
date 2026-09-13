import { Button, Checkbox, Input } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { normalizeSubtasks } from "@/utils/taskModel";

export function TaskSubtasks({
  task,
  inputValue = "",
  onInputChange,
  onChange,
}) {
  const subtasks = normalizeSubtasks(task);
  const completed = subtasks.filter((item) => item.done).length;
  const updateSubtask = (id, patch) =>
    onChange((current) => ({
      ...current,
      subtasks: normalizeSubtasks(current).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  const addSubtask = () => {
    const title = inputValue.trim();
    if (!title) return;
    const item = { id: crypto.randomUUID(), title, done: false };
    onChange((current) => ({
      ...current,
      subtasks: [...normalizeSubtasks(current), item],
    }));
    onInputChange("");
  };

  return (
    <section className="task-detail-subtasks" aria-label="子任务">
      <div className="task-detail-subtasks-header flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">子任务</h3>
        <span
          className="task-detail-subtasks-count text-xs text-muted-foreground"
          aria-live="polite"
          aria-label={`已完成 ${completed} 项，共 ${subtasks.length} 项子任务`}
        >
          {completed}/{subtasks.length}
        </span>
      </div>
      {subtasks.map((item, index) => (
        <div
          key={item.id}
          className={`task-detail-subtask-row flex items-center gap-2${item.done ? " is-done" : ""}`}
        >
          <Checkbox
            aria-label={`完成子任务：${item.title}`}
            checked={Boolean(item.done)}
            onChange={(event) =>
              updateSubtask(item.id, { done: event.target.checked })
            }
          />
          <Input
            aria-label={`子任务 ${index + 1}`}
            value={item.title}
            variant="borderless"
            className="min-w-0 flex-1"
            style={{
              height: 36,
              textDecoration: item.done ? "line-through" : "none",
            }}
            onChange={(event) =>
              updateSubtask(item.id, { title: event.target.value })
            }
          />
          <Button
            type="text"
            icon={<DeleteOutlined />}
            aria-label={`删除子任务：${item.title}`}
            title="删除子任务"
            style={{ width: 36, height: 36, flexShrink: 0 }}
            onClick={() =>
              onChange((current) => ({
                ...current,
                subtasks: normalizeSubtasks(current).filter(
                  (subtask) => subtask.id !== item.id,
                ),
              }))
            }
          />
        </div>
      ))}
      <div className="task-detail-subtask-composer flex items-center gap-2">
        <Input
          aria-label="添加子任务"
          prefix={<PlusOutlined className="text-muted-foreground" />}
          placeholder="添加子任务，回车保存"
          value={inputValue}
          className="min-w-0 flex-1"
          style={{ height: 36 }}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent?.isComposing || event.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              addSubtask();
            }
          }}
        />
        <Button
          type="text"
          disabled={!inputValue.trim()}
          style={{ height: 36, flexShrink: 0 }}
          onClick={addSubtask}
        >
          添加
        </Button>
      </div>
    </section>
  );
}

export default TaskSubtasks;
