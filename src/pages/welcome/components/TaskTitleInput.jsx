import { useEffect, useRef, useState } from "react";
import { Input } from "antd";

// Invalid input belongs to this frontend session, never to persisted task data.
// Keep it by task ID so filtering/removing the selected row cannot discard it.
const retainedDrafts = new Map();
const draftKey = (id) => String(id);
function titleError(value) {
  if (!value.trim()) return "任务标题不能为空";
  if (new TextEncoder().encode(value.trim()).length > 1000)
    return "标题过长，请控制在 1000 字节以内";
  return "";
}
function beginEditing(task) {
  const retained = retainedDrafts.get(draftKey(task.id));
  return {
    taskId: task.id,
    draft: retained ?? task.title ?? "",
    latestTitle: task.title || "",
    dirty: retained !== undefined,
  };
}
function flushEditing(current, onCommit) {
  if (!current.dirty) return true;
  if (titleError(current.draft)) {
    retainedDrafts.set(draftKey(current.taskId), current.draft);
    return false;
  }
  const title = current.draft.trim();
  // Enter is followed by blur; unmount may follow either. Claim this edit once.
  current.dirty = false;
  current.draft = title;
  retainedDrafts.delete(draftKey(current.taskId));
  if (title !== current.latestTitle) onCommit(title, current.taskId);
  return true;
}
export default function TaskTitleInput({ task, onCommit }) {
  const editing = useRef(null);
  if (!editing.current) editing.current = beginEditing(task);
  const [draft, setDraft] = useState(editing.current.draft);
  const [error, setError] = useState(() =>
    editing.current.dirty ? titleError(editing.current.draft) : "",
  );
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    if (editing.current.taskId !== task.id) {
      // A filter/MCP change can select another task without a browser blur.
      // The callback receives the original ID, even after props point elsewhere.
      flushEditing(editing.current, commitRef.current);
      editing.current = beginEditing(task);
      setDraft(editing.current.draft);
      setError(editing.current.dirty ? titleError(editing.current.draft) : "");
    } else {
      editing.current.latestTitle = task.title || "";
      // Focus alone is not an edit: keep an untouched field current with MCP.
      if (!editing.current.dirty) {
        editing.current.draft = task.title || "";
        setDraft(editing.current.draft);
        setError("");
      }
    }
  }, [task.id, task.title]);
  useEffect(() => () => flushEditing(editing.current, commitRef.current), []);
  const reset = () => {
    if (editing.current.taskId !== task.id)
      flushEditing(editing.current, commitRef.current);
    retainedDrafts.delete(draftKey(task.id));
    editing.current = beginEditing(task);
    setDraft(editing.current.draft);
    setError("");
  };
  const commit = () => {
    const current = editing.current;
    if (current.taskId !== task.id) return true;
    const saved = flushEditing(current, commitRef.current);
    setDraft(current.draft);
    setError(saved ? "" : titleError(current.draft));
    return saved;
  };
  const sameTask = editing.current.taskId === task.id;
  return (
    <div>
      <Input
        className="task-detail-title-input"
        aria-label="任务标题"
        value={
          sameTask
            ? draft
            : (retainedDrafts.get(draftKey(task.id)) ?? task.title ?? "")
        }
        variant="borderless"
        status={sameTask && error ? "error" : undefined}
        onChange={(event) => {
          if (editing.current.taskId !== task.id)
            flushEditing(editing.current, commitRef.current);
          const value = event.target.value;
          editing.current = {
            taskId: task.id,
            draft: value,
            latestTitle: task.title || "",
            dirty: value !== (task.title || ""),
          };
          if (editing.current.dirty && titleError(value))
            retainedDrafts.set(draftKey(task.id), value);
          else retainedDrafts.delete(draftKey(task.id));
          setDraft(value);
          setError("");
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (commit()) event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            reset();
          }
        }}
      />
      {sameTask && error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
