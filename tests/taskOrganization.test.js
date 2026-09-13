import test from "node:test";
import assert from "node:assert/strict";
import {
  addTaskToList,
  assignTaskSection,
  captureTrash,
  createSection,
  listSections,
  purgeTrash,
  removeSection,
  removeTaskList,
  renameSection,
  restoreTrash,
  saveTaskList,
  selectedTrash,
  taskSection,
  updateActiveTask,
} from "../src/utils/taskOrganization.js";

function fixture() {
  return {
    preferences: { untouched: true },
    lists: [
      ["甲", "2", { color: "blue" }, "preserved"],
      ["乙", "2"],
    ],
    tasks: [
      { id: 1, title: "共享任务", lists: ["甲", "乙"], section: "准备" },
      { id: 2, title: "另一个任务", list: "甲", section: "执行" },
      { id: 3, title: "其他清单", list: "乙", section: "准备" },
    ],
  };
}

test("empty sections survive serialization alongside older list metadata", () => {
  const base = fixture();
  const next = createSection(base, "甲", "  复盘  ");
  assert.deepEqual(listSections(next.lists, next.tasks, "甲"), [
    "准备",
    "执行",
    "复盘",
  ]);
  assert.deepEqual(
    listSections(JSON.parse(JSON.stringify(next.lists)), [], "甲"),
    ["准备", "执行", "复盘"],
  );
  assert.equal(next.lists[0][2].color, "blue");
  assert.equal(next.lists[0][3], "preserved");
  assert.equal(next.preferences, base.preferences);
  assert.equal(next.tasks, base.tasks);
  assert.deepEqual(base.lists[0][2], { color: "blue" });
});

test("task dialog updates its captured ID even when selection moves to another task", () => {
  const initial = fixture();
  const dialogTaskId = initial.tasks[0].id;
  const selectedTaskId = initial.tasks[1].id;
  const next = updateActiveTask(initial, dialogTaskId, {
    reminder: "2050-03-01T12:00",
  });
  assert.equal(next.tasks[0].reminder, "2050-03-01T12:00");
  assert.equal(
    next.tasks.find((task) => task.id === selectedTaskId),
    initial.tasks[1],
  );
  assert.equal(next.tasks[0].title, initial.tasks[0].title);
  assert.equal(next.tasks[0].section, initial.tasks[0].section);
  assert.equal(next.lists, initial.lists);
  assert.equal(next.preferences, initial.preferences);
  assert.equal(initial.tasks[0].reminder, undefined);
});

test("stale task dialogs refuse removed/trashed targets and never write the newly selected task", () => {
  const initial = fixture();
  for (const current of [
    { ...initial, tasks: initial.tasks.slice(1) },
    {
      ...initial,
      tasks: initial.tasks.map((task) =>
        task.id === 1 ? { ...task, deleted: true } : task,
      ),
    },
  ]) {
    const before = structuredClone(current);
    let called = false;
    assert.throws(
      () =>
        updateActiveTask(current, 1, () => {
          called = true;
          return { title: "不应写入" };
        }),
      /任务已被删除或移入垃圾桶/,
    );
    assert.equal(called, false);
    assert.deepEqual(current, before);
    assert.equal(
      current.tasks.find((task) => task.id === 2),
      initial.tasks[1],
    );
  }
  assert.throws(
    () => updateActiveTask(initial, "1", { title: "错误类型ID" }),
    /任务已被删除/,
  );
});

test("task updater receives the newest record and cannot mutate identity or original data", () => {
  const initial = fixture();
  const current = updateActiveTask(initial, 1, {
    detail: "MCP 最新备注",
    tags: ["远端"],
  });
  const next = updateActiveTask(current, 1, (task) => ({
    tags: [...task.tags, "本地"],
  }));
  assert.equal(next.tasks[0].detail, "MCP 最新备注");
  assert.deepEqual(next.tasks[0].tags, ["远端", "本地"]);
  assert.deepEqual(current.tasks[0].tags, ["远端"]);
  const before = structuredClone(current);
  assert.throws(
    () =>
      updateActiveTask(current, 1, (task) => {
        task.tags.push("不得泄露修改");
        task.id = 2;
        return task;
      }),
    /不能修改任务标识/,
  );
  assert.deepEqual(current, before);
  for (const patch of [{ id: 2 }, { id: "1" }, { id: undefined }, null, []])
    assert.throws(() => updateActiveTask(current, 1, patch));
});

test("task creation validates every current membership and preserves task/list metadata", () => {
  const initial = fixture();
  const task = {
    id: "new",
    title: "新任务",
    categories: ["乙", "甲", "乙"],
    section: "准备",
    sections: { 乙: "自选分组" },
    subtasks: [{ title: "步骤" }],
  };
  const next = addTaskToList(initial, task);
  assert.equal(next.tasks[0].list, "乙");
  assert.deepEqual(next.tasks[0].lists, ["乙", "甲"]);
  assert.deepEqual(next.tasks[0].categories, ["乙", "甲"]);
  assert.equal(next.tasks[0].sections, task.sections);
  assert.equal(next.tasks[0].subtasks, task.subtasks);
  assert.equal(next.lists, initial.lists);
  assert.equal(next.preferences, initial.preferences);
  assert.equal(next.tasks[1], initial.tasks[0]);
  assert.equal(initial.tasks.length, 3);
  assert.equal(task.list, undefined);
  const inbox = addTaskToList(initial, { id: 0, title: "默认收件箱" }).tasks[0];
  assert.deepEqual(
    [inbox.list, inbox.lists, inbox.categories],
    ["收件箱", ["收件箱"], ["收件箱"]],
  );
  const shared = addTaskToList(initial, {
    id: "inbox-shared",
    lists: ["收件箱", "甲"],
  });
  assert.deepEqual(shared.tasks[0].lists, ["收件箱", "甲"]);
});

test("stale task creation refuses missing lists and duplicate IDs without partial writes", () => {
  const current = removeTaskList(fixture(), "甲");
  const before = structuredClone(current);
  for (const task of [
    { id: "new", list: "甲" },
    { id: "shared", lists: ["乙", "甲"] },
    { id: "categories", categories: ["收件箱", "失效清单"] },
  ])
    assert.throws(() => addTaskToList(current, task), /清单.*已被删除或重命名/);
  for (const id of [1, "1", 2, "2"])
    assert.throws(
      () => addTaskToList(current, { id, list: "乙" }),
      /任务已存在/,
    );
  for (const id of [undefined, null, "", " ", NaN])
    assert.throws(
      () => addTaskToList(current, { id, list: "乙" }),
      /任务标识无效/,
    );
  assert.deepEqual(current, before);
});

test("list writes validate current data and preserve metadata plus multi-list section references", () => {
  const initial = fixture();
  initial.tasks[0].sections = { 甲: "甲组", 乙: "乙组" };
  const added = saveTaskList(initial, null, "  新建清单  ");
  assert.deepEqual(added.lists.at(-1), ["新建清单", "0"]);
  const renamed = saveTaskList(added, "甲", " 新甲 ");
  assert.deepEqual(renamed.lists[0], ["新甲", ...initial.lists[0].slice(1)]);
  assert.deepEqual(renamed.tasks[0].sections, { 新甲: "甲组", 乙: "乙组" });
  assert.deepEqual(renamed.tasks[0].lists, ["新甲", "乙"]);
  assert.deepEqual(renamed.tasks[0].categories, ["新甲", "乙"]);
  const removed = removeTaskList(renamed, "新甲");
  assert.deepEqual(removed.tasks[0].sections, { 乙: "乙组" });
  assert.deepEqual(removed.tasks[0].lists, ["乙"]);
  assert.equal(removed.tasks[1].list, "收件箱");
  assert.equal(removed.tasks[2], initial.tasks[2]);
  assert.equal(removed.tasks.length, initial.tasks.length);
  assert.equal(removed.preferences, initial.preferences);
  assert.throws(
    () => saveTaskList(renamed, "甲", "重试"),
    /清单已被删除或重命名/,
  );
  assert.throws(() => removeTaskList(removed, "新甲"), /清单已被删除或重命名/);
  for (const name of [
    " ",
    "乙",
    " 收件箱 ",
    "a".repeat(1001),
    "🌕".repeat(251),
  ])
    assert.throws(() => saveTaskList(initial, null, name));
  assert.equal(saveTaskList(initial, "甲", "甲"), initial);
  assert.equal(
    saveTaskList(initial, null, "🌕".repeat(250)).lists.at(-1)[0].length,
    500,
  );
  assert.throws(
    () => saveTaskList(initial, "收件箱", "新收件箱"),
    /收件箱不能重命名/,
  );
  assert.throws(() => removeTaskList(initial, "收件箱"), /收件箱不能删除/);
});

test("section validation prevents blank, duplicate, reserved and vanished-list writes", () => {
  const data = fixture();
  for (const name of [
    " ",
    "准备",
    " 已完成 ",
    "已放弃",
    "未分组",
    "a".repeat(41),
    "🌕".repeat(21),
  ])
    assert.throws(() => createSection(data, "甲", name));
  assert.throws(() => createSection(data, "失效清单", "测试"));
  assert.throws(() => renameSection(data, "甲", "准备", "执行"));
  assert.throws(() => renameSection(data, "甲", "失效分组", "测试"));
  assert.equal(renameSection(data, "甲", "准备", "准备"), data);
  assert.ok(
    listSections(
      createSection(data, "甲", "🌕".repeat(20)).lists,
      [],
      "甲",
    ).includes("🌕".repeat(20)),
  );
});

test("renaming and removing groups only affect the selected membership, including trash", () => {
  const data = fixture();
  data.tasks.push({ id: 4, list: "甲", section: "准备", deleted: true });
  const renamed = renameSection(data, "甲", "准备", "新准备");
  assert.equal(taskSection(renamed.tasks[0], "甲"), "新准备");
  assert.equal(taskSection(renamed.tasks[0], "乙"), "准备");
  assert.equal(taskSection(renamed.tasks[2], "乙"), "准备");
  assert.equal(taskSection(renamed.tasks[3], "甲"), "新准备");
  assert.equal(renamed.tasks[0].section, "准备");
  const removed = removeSection(renamed, "甲", "新准备");
  assert.equal(removed.tasks.length, data.tasks.length);
  assert.equal(taskSection(removed.tasks[0], "甲"), "");
  assert.equal(taskSection(removed.tasks[0], "乙"), "准备");
  assert.equal(taskSection(removed.tasks[3], "甲"), "");
  assert.deepEqual(listSections(removed.lists, removed.tasks, "甲"), ["执行"]);
  assert.deepEqual(removed.tasks[0].lists, ["甲", "乙"]);
});

test("assignment handles old category aliases, preserves unrelated overrides and supports ungrouping", () => {
  const task = {
    id: 0,
    categories: ["甲", "乙"],
    section: "旧分组",
    sections: { 乙: "乙分组" },
  };
  const assigned = assignTaskSection([task], 0, "甲", "新分组");
  assert.equal(taskSection(assigned[0]), "新分组");
  assert.equal(taskSection(assigned[0], "乙"), "乙分组");
  assert.equal(
    taskSection(assignTaskSection(assigned, 0, "甲", "")[0], "甲"),
    "",
  );
  assert.throws(
    () => assignTaskSection([task], 0, "其他清单", "分组"),
    /所属清单已改变/,
  );
  assert.throws(
    () => assignTaskSection([task], "0", "甲", "分组"),
    /任务已被删除/,
  );
  assert.equal(
    taskSection({ list: "甲", section: "旧分组", sections: [] }),
    "旧分组",
  );
  assert.deepEqual(
    listSections(
      [["甲", 0, { sections: ["空组", "空组", null] }]],
      [
        { list: "甲", section: "旧分组" },
        { list: "甲", section: "已删除组", deleted: true },
      ],
      "甲",
    ),
    ["空组", "旧分组"],
  );
});

test("stale section operations fail without recreating renamed/deleted groups or changing memberships", () => {
  const initial = createSection(fixture(), "甲", "空组");
  const deleted = removeSection(initial, "甲", "空组");
  const renamed = renameSection(initial, "甲", "空组", "新空组");
  for (const current of [deleted, renamed]) {
    const before = structuredClone(current);
    assert.throws(
      () => removeSection(current, "甲", "空组"),
      /分组已被删除或重命名/,
    );
    assert.throws(
      () => renameSection(current, "甲", "空组", "再改名"),
      /分组已被删除或重命名/,
    );
    assert.throws(
      () => assignTaskSection(current.tasks, 1, "甲", "空组", current.lists),
      /分组已被删除或重命名/,
    );
    assert.deepEqual(current, before);
  }
  const withoutList = {
    ...initial,
    lists: initial.lists.filter(([name]) => name !== "甲"),
  };
  for (const action of [
    () => createSection(withoutList, "甲", "新分组"),
    () => renameSection(withoutList, "甲", "准备", "准备"),
    () => removeSection(withoutList, "甲", "准备"),
    () =>
      assignTaskSection(withoutList.tasks, 1, "甲", "准备", withoutList.lists),
  ])
    assert.throws(action, /清单已被删除或重命名/);
  assert.throws(
    () =>
      assignTaskSection(
        [{ id: 1, list: "甲", deleted: true }],
        1,
        "甲",
        "",
        initial.lists,
      ),
    /任务已被删除/,
  );
  assert.throws(
    () => assignTaskSection(initial.tasks, 1, "甲", "已完成", initial.lists),
    /系统分组/,
  );
  assert.equal(
    taskSection(
      assignTaskSection(initial.tasks, 1, "甲", " 空组 ", initial.lists)[0],
      "甲",
    ),
    "空组",
  );
  assert.equal(
    taskSection(
      assignTaskSection([{ id: 4, list: "收件箱" }], 4, "收件箱", "", [])[0],
    ),
    "",
  );
});

test("trash single restore preserves memberships, completion and other tasks", () => {
  const tasks = [
    {
      id: 1,
      lists: ["甲", "乙"],
      title: "共享已完成任务",
      done: true,
      deleted: true,
      deletedAt: 123,
      subtasks: [{ title: "步骤", done: true }],
    },
    { id: 2, list: "乙", deleted: true },
    { id: 3, list: "丙", deleted: false },
  ];
  const restored = restoreTrash(tasks, captureTrash(tasks, 1));
  assert.equal(restored[0].deleted, false);
  assert.equal(restored[0].deletedAt, undefined);
  assert.deepEqual(restored[0].lists, ["甲", "乙"]);
  assert.equal(restored[0].done, true);
  assert.deepEqual(restored[0].subtasks, tasks[0].subtasks);
  assert.equal(restored[1], tasks[1]);
  assert.equal(restored[2], tasks[2]);
  assert.deepEqual(purgeTrash(tasks, captureTrash(tasks, 1)), tasks.slice(1));
});

test("bulk confirmation skips later deletions, changed records and restored records", () => {
  const tasks = [
    { id: "a", deleted: true, title: "保留确认" },
    { id: "b", deleted: true, title: "之后修改" },
    { id: "c", deleted: true, title: "之后恢复" },
    { id: "d", deleted: false, title: "之后删除" },
  ];
  const snapshot = captureTrash(tasks);
  const current = tasks.map((task) =>
    task.id === "b"
      ? { ...task, title: "其他端更新" }
      : task.id === "c"
        ? { ...task, deleted: false }
        : task.id === "d"
          ? { ...task, deleted: true }
          : task,
  );
  current.push({ id: "e", deleted: true });
  assert.deepEqual(
    selectedTrash(current, snapshot).map((task) => task.id),
    ["a"],
  );
  assert.deepEqual(
    purgeTrash(current, snapshot).map((task) => task.id),
    ["b", "c", "d", "e"],
  );
  assert.deepEqual(
    restoreTrash(current, snapshot)
      .filter((task) => task.deleted)
      .map((task) => task.id),
    ["b", "d", "e"],
  );
  assert.equal(purgeTrash(current, snapshot)[0], current[1]);
});

test("trash snapshots are independent of field order and distinguish numeric IDs and live duplicates", () => {
  const tasks = [
    { id: 1, deleted: true, details: { b: 2, a: 1 } },
    { id: "1", deleted: true },
    { id: 1, deleted: false, title: "畸形旧数据也不能被误删" },
  ];
  const snapshot = captureTrash(tasks, 1);
  const reordered = [
    { details: { a: 1, b: 2 }, deleted: true, id: 1 },
    ...tasks.slice(1),
  ];
  assert.deepEqual(purgeTrash(reordered, snapshot), tasks.slice(1));
  assert.equal(restoreTrash(reordered, snapshot)[2], tasks[2]);
  assert.deepEqual(captureTrash(tasks, "missing"), []);
  assert.deepEqual(purgeTrash(tasks, []), tasks);
  assert.deepEqual(restoreTrash([], snapshot), []);
});
