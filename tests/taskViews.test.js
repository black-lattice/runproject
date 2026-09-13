import test from "node:test";
import assert from "node:assert/strict";
import {
  taskGroups,
  collectTaskActivity,
  shiftCalendarAnchor,
  nextTaskSelection,
} from "../src/utils/taskViews.js";

test("background filtering retains the active editor while explicit view changes can select another task", () => {
  const a = { id: "A" },
    b = { id: "B" };
  assert.equal(nextTaskSelection("A", [b], [a, b]), "A");
  assert.equal(nextTaskSelection("A", [], [a, b]), "A");
  assert.equal(nextTaskSelection("A", [b], [a, b], true), "B");
  assert.equal(nextTaskSelection("A", [b], [b]), "B");
  assert.equal(nextTaskSelection("B", [b, a], [a, b], true), "B");
  assert.equal(nextTaskSelection(null, [{ id: 0 }], [{ id: 0 }]), 0);
});

test("calendar paging matches each visible range without agenda gaps or overlap", () => {
  assert.equal(shiftCalendarAnchor("2026-10-13", "议程", 1), "2026-11-12");
  assert.equal(shiftCalendarAnchor("2026-11-12", "议程", -1), "2026-10-13");
  assert.equal(shiftCalendarAnchor("2024-01-31", "月", 1), "2024-02-29");
  assert.equal(shiftCalendarAnchor("2026-09-13", "周", 1), "2026-09-20");
  assert.equal(shiftCalendarAnchor("2026-12-31", "日", 1), "2027-01-01");
});

test("legacy section names never collide with completion or ungrouped records", () => {
  const tasks = [
    { id: "legacy", list: "工作", section: "已完成" },
    { id: "plain", list: "工作" },
    { id: "done", list: "工作", status: "done" },
    { id: "abandoned", list: "工作", done: true, status: "abandoned" },
  ];
  const groups = taskGroups(tasks, {
    lists: [["工作", 0, { sections: ["空分组"] }]],
    tasks,
    listName: "工作",
  });
  assert.deepEqual(
    groups
      .flatMap((group) => group.items)
      .map((task) => task.id)
      .sort(),
    tasks.map((task) => task.id).sort(),
  );
  assert.equal(
    groups.find((group) => group.key === "section:已完成").label,
    "已完成（分组）",
  );
  assert.equal(
    groups.find((group) => group.key === "section:空分组").items.length,
    0,
  );
  assert.equal(
    groups.find((group) => group.key === "status:abandoned").finished,
    true,
  );
});

test("grouping uses selected-list overrides and retains filtered empty sections", () => {
  const tasks = [
    {
      id: "multi",
      lists: ["A", "B"],
      list: "A",
      section: "旧分组",
      sections: { A: "", B: "B分组" },
    },
  ];
  assert.equal(
    taskGroups(tasks, { tasks, listName: "A" }).find(
      (group) => group.items.length,
    )?.key,
    "section:",
  );
  assert.equal(
    taskGroups(tasks, { tasks, listName: "B" }).find(
      (group) => group.items.length,
    )?.key,
    "section:B分组",
  );
  assert.ok(
    taskGroups([], { tasks, listName: "B" }).some(
      (group) => group.key === "section:B分组",
    ),
  );
});

test("activity limit preserves newest events across task order and disambiguates IDs", () => {
  const tasks = [
    {
      id: "first",
      title: "新任务",
      activity: [{ id: "event", at: 500, message: "新动态" }],
    },
    {
      id: "last",
      title: "旧任务",
      activity: [
        { id: "event", at: 1, message: "旧动态" },
        { id: "other", at: 10, message: "稍早" },
        { at: "invalid" },
      ],
    },
  ];
  const activity = collectTaskActivity(tasks, 2);
  assert.deepEqual(
    activity.map((event) => event.at),
    [10, 500],
  );
  assert.equal(activity[1].id, "first:event");
  assert.equal(activity[1].message, "新任务 · 新动态");
});
