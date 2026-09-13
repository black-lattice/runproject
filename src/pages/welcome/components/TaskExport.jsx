import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Empty, Modal } from "antd";
import { CopyOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  createTaskExportSnapshot,
  exportSnapshotTime,
  exportTaskDate,
  taskExportText,
} from "@/utils/taskExport";

export function TaskExportContent({ snapshot }) {
  return (
    <div className="task-export-content space-y-5 text-sm text-foreground">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold break-words">{snapshot.title}</h1>
        <p className="text-xs text-muted-foreground">
          {exportSnapshotTime(snapshot)} · {snapshot.tasks.length} 项任务
        </p>
        <p className="text-xs text-muted-foreground">
          范围：打开导出窗口时的当前视图快照。之后的任务修改不会改变本次导出。
        </p>
        <p className="text-xs text-muted-foreground">
          附件仅包含名称，不包含文件内容；任务动态不包含在导出中。
        </p>
      </header>
      {!snapshot.tasks.length && (
        <p className="py-6 text-center text-muted-foreground">
          当前视图没有任务。
        </p>
      )}
      {snapshot.tasks.map((task, index) => (
        <article
          key={`${task.id}-${index}`}
          className="task-export-item space-y-3 rounded-lg border border-border p-4"
        >
          <h2 className="text-base font-semibold whitespace-pre-wrap break-words">
            {index + 1}. {task.title}
          </h2>
          <dl className="task-export-facts grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
            {[
              ["状态", `${task.status}${task.deleted ? "（回收站）" : ""}`],
              ["日期", exportTaskDate(task)],
              ["清单", task.lists.join("、")],
              ["优先级", task.priority],
              [
                "标签",
                task.tags.length
                  ? task.tags.map((tag) => `#${tag}`).join(" ")
                  : "无",
              ],
              ...(task.reminder ? [["提醒", task.reminder]] : []),
              ...(task.repeat ? [["重复", task.repeat]] : []),
            ].map(([label, value]) => (
              <div className="flex min-w-0 gap-2" key={label}>
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <section>
            <h3 className="mb-1 font-medium">备注</h3>
            <p className="task-export-long-text whitespace-pre-wrap break-words">
              {task.detail || "无"}
            </p>
          </section>
          {task.subtasks.length > 0 && (
            <section>
              <h3 className="mb-1 font-medium">子任务</h3>
              <ul className="space-y-1">
                {task.subtasks.map((item, position) => (
                  <li
                    className="flex gap-2 whitespace-pre-wrap break-words"
                    key={position}
                  >
                    <span
                      className="shrink-0"
                      aria-label={item.done ? "已完成" : "未完成"}
                    >
                      {item.done ? "☑" : "☐"}
                    </span>
                    <span className="min-w-0">{item.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {task.attachments.length > 0 && (
            <section>
              <h3 className="mb-1 font-medium">附件名称</h3>
              <ul className="list-disc pl-5">
                {task.attachments.map((name, position) => (
                  <li
                    className="whitespace-pre-wrap break-words"
                    key={position}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {task.comments.length > 0 && (
            <section>
              <h3 className="mb-1 font-medium">评论</h3>
              <ul className="list-disc pl-5 space-y-2">
                {task.comments.map((item, position) => (
                  <li
                    className="whitespace-pre-wrap break-words"
                    key={position}
                  >
                    {item.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      ))}
    </div>
  );
}

export function TaskExportDialog({
  open,
  onClose,
  title = "任务导出",
  tasks = [],
  onFeedback,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const wasOpen = useRef(false);
  const portalId = `task-export-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  useEffect(() => {
    if (open && !wasOpen.current)
      setSnapshot(createTaskExportSnapshot({ title, tasks }));
    wasOpen.current = open;
  }, [open, title, tasks]);
  useEffect(() => {
    const clearPrint = () => {
      if (document.body.dataset.taskExportPrint === portalId)
        delete document.body.dataset.taskExportPrint;
    };
    window.addEventListener("afterprint", clearPrint);
    if (!open) clearPrint();
    return () => {
      window.removeEventListener("afterprint", clearPrint);
      clearPrint();
    };
  }, [open, portalId]);
  const tell = (description, failed = false) =>
    onFeedback?.({
      description,
      ...(failed ? { variant: "destructive" } : {}),
    });
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("当前环境无法访问剪贴板，可在预览中选择并复制内容");
      await navigator.clipboard.writeText(taskExportText(snapshot));
      tell(`已复制 ${snapshot.tasks.length} 项任务的完整文本`);
    } catch (failure) {
      tell(failure.message || "复制失败，请重试", true);
    }
  };
  const print = async () => {
    try {
      if (typeof window.print !== "function")
        throw new Error("当前环境无法打开打印，请先复制文本后打印");
      document.body.dataset.taskExportPrint = portalId;
      await window.print();
    } catch (failure) {
      delete document.body.dataset.taskExportPrint;
      tell(
        typeof failure === "string"
          ? failure
          : failure?.message || "无法打开打印窗口，请重试",
        true,
      );
    }
  };
  return (
    <>
      <Modal
        title="导出预览"
        open={open}
        onCancel={onClose}
        width={800}
        destroyOnHidden
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose}>关闭</Button>
            <Button icon={<CopyOutlined />} disabled={!snapshot} onClick={copy}>
              复制完整文本
            </Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              disabled={!snapshot}
              onClick={print}
            >
              打印
            </Button>
          </div>
        }
      >
        <div
          className="max-h-[65vh] overflow-y-auto py-2 pr-2"
          aria-label="任务导出预览"
        >
          {snapshot ? (
            <TaskExportContent snapshot={snapshot} />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="正在准备导出…"
            />
          )}
        </div>
      </Modal>
      {open &&
        snapshot &&
        createPortal(
          <div id={portalId} aria-hidden="true" style={{ display: "none" }}>
            <style>{`
        @media print {
          @page { margin: 16mm; }
          html:has(body[data-task-export-print="${portalId}"]),
          body[data-task-export-print="${portalId}"] { height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; margin: 0 !important; padding: 0 !important; }
          body[data-task-export-print="${portalId}"] > :not(#${portalId}) { display: none !important; }
          body[data-task-export-print="${portalId}"] > #${portalId} { display: block !important; position: static !important; width: auto !important; height: auto !important; overflow: visible !important; color: black !important; background: white !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
          #${portalId} * { color: black !important; background: transparent !important; overflow: visible !important; max-height: none !important; height: auto !important; box-shadow: none !important; text-overflow: clip !important; }
          #${portalId} .task-export-content { display: block; font-size: 10pt; line-height: 1.6; }
          #${portalId} header { margin-bottom: 20pt; }
          #${portalId} .task-export-item { display: block; padding: 12pt 0; border: 0; border-top: 1px solid #bbb; border-radius: 0; break-inside: auto; page-break-inside: auto; }
          #${portalId} .task-export-facts { display: block; }
          #${portalId} .task-export-facts > div { display: block; }
          #${portalId} dt, #${portalId} dd { display: inline; }
          #${portalId} dt::after { content: "："; }
          #${portalId} h1, #${portalId} h2, #${portalId} h3 { break-after: avoid; page-break-after: avoid; }
          #${portalId} p, #${portalId} li, #${portalId} dd { white-space: pre-wrap !important; overflow-wrap: anywhere !important; word-break: break-word; }
          #${portalId} p, #${portalId} section, #${portalId} ul, #${portalId} li { break-inside: auto; page-break-inside: auto; }
        }
      `}</style>
            <TaskExportContent snapshot={snapshot} />
          </div>,
          document.body,
        )}
    </>
  );
}
