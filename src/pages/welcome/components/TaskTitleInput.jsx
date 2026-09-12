import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
export default function TaskTitleInput({ task, onCommit }) {
  const [draft, setDraft] = useState(task.title || "");
  const [error, setError] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    focused.current = false;
    setDraft(task.title || "");
    setError("");
  }, [task.id]);
  useEffect(() => {
    if (!focused.current) setDraft(task.title || "");
  }, [task.title]);
  const commit = () => {
    const title = draft.trim();
    if (!title) {
      setError("任务标题不能为空，已保留原来的标题");
      setDraft(task.title || "未命名任务");
      return;
    }
    if (new TextEncoder().encode(title).length > 1000) {
      setError("标题过长，请控制在 1000 字节以内");
      return;
    }
    setError("");
    if (title !== task.title) onCommit(title);
  };
  return (
    <div>
      <Input
        aria-label="任务标题"
        value={draft}
        variant="borderless"
        status={error ? "error" : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            commit();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(task.title || "");
            setError("");
          }
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
