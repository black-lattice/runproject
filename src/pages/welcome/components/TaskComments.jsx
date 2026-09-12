import { useState } from "react";
import { Button, Empty, Input } from "antd";
export default function TaskComments({ task, onChange }) {
  const [draft, setDraft] = useState("");
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const add = () => {
    if (!draft.trim()) return;
    const comment = {
      id: crypto.randomUUID(),
      text: draft.trim(),
      at: Date.now(),
    };
    onChange((current) => ({
      ...current,
      comments: [...(current.comments || []), comment],
    }));
    setDraft("");
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        补充进展或记录决策，评论保存在本机任务中。
      </p>
      <div className="max-h-80 overflow-auto space-y-3">
        {comments.length ? (
          comments.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-border p-3"
            >
              <time className="text-xs text-muted-foreground">
                {new Date(item.at).toLocaleString("zh-CN")}
              </time>
              <p className="whitespace-pre-wrap break-words mt-2 text-sm">
                {item.text}
              </p>
            </article>
          ))
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有评论"
          />
        )}
      </div>
      <Input.TextArea
        aria-label="评论内容"
        value={draft}
        maxLength={10000}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="记录任务进展…"
        autoSize={{ minRows: 3, maxRows: 8 }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") add();
        }}
      />
      <Button type="primary" disabled={!draft.trim()} onClick={add}>
        添加评论
      </Button>
    </div>
  );
}
