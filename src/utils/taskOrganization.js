import { changeList, taskLists, withLists } from "./taskModel.js";

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const uniqueNames = (values) => [...new Set(values.map(clean).filter(Boolean))];
export const SYSTEM_SECTION_NAMES = ["已完成", "已放弃", "未分组"];

// The old section field remains the fallback for each membership. A per-list
// override (including "") prevents organizing one list from changing another.
export function taskSection(task, listName = taskLists(task)[0]) {
  const sections = object(task.sections);
  return Object.hasOwn(sections, listName)
    ? clean(sections[listName])
    : clean(task.section);
}

export function listSections(lists, tasks, listName) {
  const entry = lists.find((item) => item[0] === listName);
  const saved = object(entry?.[2]).sections;
  return uniqueNames([
    ...(Array.isArray(saved) ? saved : []),
    ...tasks
      .filter((task) => !task.deleted && taskLists(task).includes(listName))
      .map((task) => taskSection(task, listName)),
  ]);
}

export function validateSectionName(value) {
  const name = clean(value);
  if (!name) throw new Error("请输入分组名称");
  if (name.length > 40) throw new Error("分组名称最多 40 个字");
  if (SYSTEM_SECTION_NAMES.includes(name))
    throw new Error(`“${name}”是系统分组，请使用其他名称`);
  return name;
}

function requireList(lists, listName) {
  if (!lists.some((item) => item[0] === listName))
    throw new Error("清单已被删除或重命名，请重新选择清单");
}

export function addTaskToList(data, task) {
  const id = task?.id;
  if (
    !(
      (typeof id === "string" && id.trim()) ||
      (typeof id === "number" && Number.isFinite(id))
    )
  )
    throw new Error("任务标识无效，请重新创建任务");
  // SQLite and MCP treat numeric IDs and their string form as the same record.
  if (data.tasks.some((item) => String(item.id) === String(id)))
    throw new Error("任务已存在，请勿重复创建");
  const names = taskLists(task);
  for (const name of names) {
    if (name !== "收件箱" && !data.lists.some(([label]) => label === name))
      throw new Error(`清单“${name}”已被删除或重命名，请重新选择清单`);
  }
  return { ...data, tasks: [withLists(task, names), ...data.tasks] };
}

export function updateActiveTask(data, taskId, patchOrUpdater) {
  const index = data.tasks.findIndex((task) => task.id === taskId);
  const task = data.tasks[index];
  if (!task || task.deleted)
    throw new Error("任务已被删除或移入垃圾桶，请关闭弹窗后重新选择任务");
  const patch =
    typeof patchOrUpdater === "function"
      ? patchOrUpdater(structuredClone(task))
      : patchOrUpdater;
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("任务修改数据无效，请重试");
  if (Object.hasOwn(patch, "id") && patch.id !== task.id)
    throw new Error("不能修改任务标识，请重新选择任务");
  return {
    ...data,
    tasks: data.tasks.map((item, position) =>
      position === index ? { ...task, ...patch } : item,
    ),
  };
}

export function saveTaskList(data, previousName, value) {
  if (previousName === "收件箱") throw new Error("收件箱不能重命名");
  if (previousName) requireList(data.lists, previousName);
  const name = clean(value);
  if (!name) throw new Error("请输入清单名称");
  if (name === "收件箱") throw new Error("不能使用系统清单名称“收件箱”");
  if (new TextEncoder().encode(name).length > 1000)
    throw new Error("清单名称不能超过 1000 字节");
  if (data.lists.some(([label]) => label === name && label !== previousName))
    throw new Error("已存在同名清单");
  if (previousName === name) return data;
  return {
    ...data,
    lists: previousName
      ? data.lists.map((entry) =>
          entry[0] === previousName ? [name, ...entry.slice(1)] : entry,
        )
      : [...data.lists, [name, "0"]],
    tasks: previousName
      ? changeList(data.tasks, previousName, name)
      : data.tasks,
  };
}

export function removeTaskList(data, name) {
  if (name === "收件箱") throw new Error("收件箱不能删除");
  requireList(data.lists, name);
  return {
    ...data,
    lists: data.lists.filter(([label]) => label !== name),
    tasks: changeList(data.tasks, name, null),
  };
}

function setListSections(lists, listName, sections) {
  requireList(lists, listName);
  return lists.map((entry) => {
    if (entry[0] !== listName) return entry;
    const next = [...entry];
    next[2] = { ...object(entry[2]), sections: uniqueNames(sections) };
    return next;
  });
}

export function createSection(data, listName, value) {
  requireList(data.lists, listName);
  const name = validateSectionName(value);
  const sections = listSections(data.lists, data.tasks, listName);
  if (sections.includes(name)) throw new Error("该清单中已存在同名分组");
  return {
    ...data,
    lists: setListSections(data.lists, listName, [...sections, name]),
  };
}

export function assignTaskSection(tasks, taskId, listName, value, lists) {
  const section = clean(value);
  if (section) validateSectionName(section);
  const selected = tasks.find((task) => task.id === taskId);
  if (!selected || selected.deleted)
    throw new Error("任务已被删除，请重新选择任务");
  if (!taskLists(selected).includes(listName))
    throw new Error("任务所属清单已改变，请重新选择清单");
  if (lists) {
    if (listName !== "收件箱") requireList(lists, listName);
    if (section && !listSections(lists, tasks, listName).includes(section))
      throw new Error("分组已被删除或重命名，请重新选择分组");
  }
  return tasks.map((task) =>
    task.id === taskId && taskLists(task).includes(listName)
      ? { ...task, sections: { ...object(task.sections), [listName]: section } }
      : task,
  );
}

export function renameSection(data, listName, previous, value) {
  requireList(data.lists, listName);
  const name = validateSectionName(value);
  const sections = listSections(data.lists, data.tasks, listName);
  if (!sections.includes(previous))
    throw new Error("分组已被删除或重命名，请重新选择分组");
  if (name === previous) return data;
  if (sections.includes(name)) throw new Error("该清单中已存在同名分组");
  return {
    ...data,
    lists: setListSections(
      data.lists,
      listName,
      sections.map((section) => (section === previous ? name : section)),
    ),
    tasks: data.tasks.map((task) =>
      taskLists(task).includes(listName) &&
      taskSection(task, listName) === previous
        ? { ...task, sections: { ...object(task.sections), [listName]: name } }
        : task,
    ),
  };
}

export function removeSection(data, listName, name) {
  requireList(data.lists, listName);
  const sections = listSections(data.lists, data.tasks, listName);
  if (!sections.includes(name))
    throw new Error("分组已被删除或重命名，请重新选择分组");
  return {
    ...data,
    lists: setListSections(
      data.lists,
      listName,
      sections.filter((value) => value !== name),
    ),
    tasks: data.tasks.map((task) =>
      taskLists(task).includes(listName) && taskSection(task, listName) === name
        ? { ...task, sections: { ...object(task.sections), [listName]: "" } }
        : task,
    ),
  };
}

// Store the exact records shown when an operation is requested. A confirmation
// must never affect newly deleted, restored, or edited tasks received meanwhile.
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  return value;
}
const fingerprint = (task) => JSON.stringify(stableValue(task));
const identity = (id) => JSON.stringify([typeof id, id]);

export function captureTrash(tasks, taskId) {
  return tasks
    .filter(
      (task) => task.deleted && (taskId === undefined || task.id === taskId),
    )
    .map((task) => ({ id: task.id, fingerprint: fingerprint(task) }));
}

export function selectedTrash(tasks, snapshot) {
  const captured = new Map(
    snapshot.map((item) => [identity(item.id), item.fingerprint]),
  );
  return tasks.filter(
    (task) =>
      task.deleted && captured.get(identity(task.id)) === fingerprint(task),
  );
}

export function restoreTrash(tasks, snapshot) {
  const selected = new Set(selectedTrash(tasks, snapshot));
  return tasks.map((task) => {
    if (!selected.has(task)) return task;
    const restored = { ...task, deleted: false };
    delete restored.deletedAt;
    return restored;
  });
}

export function purgeTrash(tasks, snapshot) {
  const selected = new Set(selectedTrash(tasks, snapshot));
  return tasks.filter((task) => !selected.has(task));
}
