import { taskLists } from "./taskModel.js";

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const uniqueNames = (values) => [...new Set(values.map(clean).filter(Boolean))];

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
  if (["已完成", "未分组"].includes(name))
    throw new Error(`“${name}”是系统分组，请使用其他名称`);
  return name;
}

function setListSections(lists, listName, sections) {
  if (!lists.some((item) => item[0] === listName))
    throw new Error("清单已不存在，请重新选择清单");
  return lists.map((entry) => {
    if (entry[0] !== listName) return entry;
    const next = [...entry];
    next[2] = { ...object(entry[2]), sections: uniqueNames(sections) };
    return next;
  });
}

export function createSection(data, listName, value) {
  const name = validateSectionName(value);
  const sections = listSections(data.lists, data.tasks, listName);
  if (sections.includes(name)) throw new Error("该清单中已存在同名分组");
  return {
    ...data,
    lists: setListSections(data.lists, listName, [...sections, name]),
  };
}

export function assignTaskSection(tasks, taskId, listName, value) {
  const section = clean(value);
  return tasks.map((task) =>
    task.id === taskId && taskLists(task).includes(listName)
      ? { ...task, sections: { ...object(task.sections), [listName]: section } }
      : task,
  );
}

export function renameSection(data, listName, previous, value) {
  const name = validateSectionName(value);
  const sections = listSections(data.lists, data.tasks, listName);
  if (!sections.includes(previous)) throw new Error("该分组已不存在");
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
  return {
    ...data,
    lists: setListSections(
      data.lists,
      listName,
      listSections(data.lists, data.tasks, listName).filter(
        (value) => value !== name,
      ),
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
