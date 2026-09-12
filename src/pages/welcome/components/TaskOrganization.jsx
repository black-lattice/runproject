import { useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  PlusOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  assignTaskSection,
  captureTrash,
  createSection,
  listSections,
  purgeTrash,
  removeSection,
  renameSection,
  restoreTrash,
  selectedTrash,
  taskSection,
} from "@/utils/taskOrganization";
import { taskLists } from "@/utils/taskModel";

// onChange receives one { tasks, lists } updater so a group rename is persisted
// atomically with its tasks. It may preserve other fields on the data object.
export function TaskSectionManager({ listName, lists, tasks, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  const sections = listSections(lists, tasks, listName);
  const count = (name) =>
    tasks.filter(
      (task) =>
        !task.deleted &&
        taskLists(task).includes(listName) &&
        taskSection(task, listName) === name,
    ).length;
  const apply = (transform) => {
    try {
      // Validate against the displayed state first. The updater validates again
      // against current state so changes from MCP cannot silently overwrite it.
      transform({ lists, tasks });
      onChange(transform);
      setDraft("");
      setEditing(null);
      setError("");
      return true;
    } catch (reason) {
      setError(reason.message || "操作失败，请重试");
      return false;
    }
  };
  const save = () =>
    apply((data) =>
      editing === null
        ? createSection(data, listName, draft)
        : renameSection(data, listName, editing, draft),
    );

  return (
    <>
      <Button
        icon={<FolderOutlined />}
        onClick={() => {
          setError("");
          setDraft("");
          setEditing(null);
          setOpen(true);
        }}
      >
        管理分组
      </Button>
      <Modal
        title={`管理分组 · ${listName}`}
        open={open}
        onCancel={() => {
          setOpen(false);
          setDeleting(null);
        }}
        footer={<Button onClick={() => setOpen(false)}>完成</Button>}
        width={480}
      >
        <div className="flex flex-col gap-4 py-2">
          <Typography.Text type="secondary">
            分组只用于整理当前清单；移除分组会保留其中的任务。
          </Typography.Text>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Input
              aria-label={editing === null ? "新分组名称" : "重命名分组"}
              placeholder={
                editing === null ? "输入新分组名称" : "输入新的分组名称"
              }
              maxLength={40}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              autoFocus
            />
            <Button
              type="primary"
              htmlType="submit"
              icon={editing === null ? <PlusOutlined /> : undefined}
            >
              {editing === null ? "添加" : "保存"}
            </Button>
            {editing !== null && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                  setError("");
                }}
              >
                取消
              </Button>
            )}
          </form>
          {error && <Alert type="error" title={error} showIcon />}
          {!sections.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有分组，可以从「工作」或「生活」开始"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {sections.map((name) => (
                <div
                  key={name}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate" title={name}>
                    {name}
                  </span>
                  <Typography.Text type="secondary">
                    {count(name)} 项
                  </Typography.Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={`重命名分组 ${name}`}
                    onClick={() => {
                      setEditing(name);
                      setDraft(name);
                      setError("");
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`移除分组 ${name}`}
                    onClick={() => setDeleting(name)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        title="移除分组"
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        okText="移除分组，保留任务"
        cancelText="取消"
        onOk={() => {
          if (apply((data) => removeSection(data, listName, deleting)))
            setDeleting(null);
        }}
      >
        <p>
          移除“{deleting}”后，当前清单中的 {count(deleting)}{" "}
          项任务会移至未分组。任务内容和其他所属清单中的分组保持不变。
        </p>
      </Modal>
    </>
  );
}

// onChange receives a tasks updater, matching useProductivityData.setTasks.
export function TaskSectionSelect({ task, listName, lists, tasks, onChange }) {
  if (!listName || !taskLists(task).includes(listName)) return null;
  const sections = listSections(lists, tasks, listName);
  const current = taskSection(task, listName);
  const options = [...new Set([...sections, current].filter(Boolean))];
  return (
    <Select
      aria-label={`${listName}中的任务分组`}
      className="w-full"
      showSearch
      optionFilterProp="label"
      value={current}
      options={[
        { value: "", label: "未分组" },
        ...options.map((name) => ({ value: name, label: name })),
      ]}
      onChange={(name) =>
        onChange((items) => assignTaskSection(items, task.id, listName, name))
      }
    />
  );
}

// Leaving taskId out renders the toolbar for all currently deleted tasks.
// Confirmations retain a record snapshot, even if the data changes while open.
export function TrashActions({ tasks, onChange, taskId }) {
  const [snapshot, setSnapshot] = useState(null);
  const items = selectedTrash(tasks, captureTrash(tasks, taskId));
  const pending = snapshot ? selectedTrash(tasks, snapshot) : [];
  const single = taskId !== undefined;
  if (!items.length && !snapshot) return null;
  return (
    <>
      <Space wrap size="small">
        <Button
          disabled={!items.length}
          icon={<UndoOutlined />}
          onClick={() => {
            const captured = captureTrash(tasks, taskId);
            onChange((current) => restoreTrash(current, captured));
          }}
        >
          {single ? "恢复任务" : `恢复全部 (${items.length})`}
        </Button>
        <Button
          danger
          disabled={!items.length}
          icon={<DeleteOutlined />}
          onClick={() => setSnapshot(captureTrash(tasks, taskId))}
        >
          {single ? "永久删除" : `清空垃圾桶 (${items.length})`}
        </Button>
      </Space>
      <Modal
        title={single ? "永久删除任务" : "清空垃圾桶"}
        open={snapshot !== null}
        onCancel={() => setSnapshot(null)}
        okText={`永久删除 ${pending.length} 项任务`}
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !pending.length }}
        onOk={() => {
          const captured = snapshot;
          onChange((current) => purgeTrash(current, captured));
          setSnapshot(null);
        }}
      >
        <div className="flex flex-col gap-3 py-2">
          <Typography.Text>
            即将永久删除 {pending.length}{" "}
            项任务及其子任务、备注。此操作无法撤销。
          </Typography.Text>
          {single && pending[0] && (
            <Typography.Text strong>{pending[0].title}</Typography.Text>
          )}
          <Typography.Text type="secondary">
            只处理打开此确认框时选中的垃圾桶任务；之后新增、恢复或修改的任务会保留。
          </Typography.Text>
          {snapshot && pending.length < snapshot.length && (
            <Alert
              type="info"
              showIcon
              title={`${snapshot.length - pending.length} 项任务已发生变化，将跳过处理。`}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
