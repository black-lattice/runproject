import test from "node:test";
import assert from "node:assert/strict";
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

test("section validation prevents blank, duplicate, reserved and vanished-list writes", () => {
  const data = fixture();
  for (const name of [" ", "准备", "已完成", "未分组", "a".repeat(41)])
    assert.throws(() => createSection(data, "甲", name));
  assert.throws(() => createSection(data, "失效清单", "测试"));
  assert.throws(() => renameSection(data, "甲", "准备", "执行"));
  assert.throws(() => renameSection(data, "甲", "失效分组", "测试"));
  assert.equal(renameSection(data, "甲", "准备", "准备"), data);
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
  assert.equal(assignTaskSection([task], 0, "其他清单", "分组")[0], task);
  assert.equal(assignTaskSection([task], "0", "甲", "分组")[0], task);
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
