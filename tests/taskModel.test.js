import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuickTask,
  taskLists,
  withLists,
  changeList,
  selectTasks,
  searchTasks,
  quadrantOf,
  moveTaskTo,
  toolGroups,
  normalizeSubtasks,
} from "../src/utils/taskModel.js";
const today = "2026-09-13";
test("quick add preserves normal numbers and rejects invalid times while respecting context", () => {
  assert.deepEqual(parseQuickTask("明天下午3点开会", today), {
    title: "开会",
    date: "2026-09-14",
    time: "15:00",
  });
  assert.deepEqual(parseQuickTask("买2个苹果", today), {
    title: "买2个苹果",
    date: "",
    time: "",
  });
  assert.equal(parseQuickTask("计划 29:99", today).time, "");
  assert.equal(parseQuickTask("报告", today, "2026-10-02").date, "2026-10-02");
  assert.equal(parseQuickTask("今天上午12点记录", today).time, "00:00");
});
test("global search crosses date and list filters, excludes trash, searches details/tags", () => {
  const tasks = [
    { id: 1, title: "会议", list: "甲", date: today },
    {
      id: 2,
      title: "报告",
      list: "乙",
      date: "2027-01-01",
      detail: "跨清单关键词",
    },
    { id: 3, title: "关键词", deleted: true },
  ];
  assert.deepEqual(
    selectTasks(tasks, { nav: "today", day: today }).map((t) => t.id),
    [1],
  );
  assert.deepEqual(
    searchTasks(tasks, "关键词").map((t) => t.id),
    [2],
  );
});
test("rename/delete keep all category aliases consistent and preserve other lists", () => {
  const task = {
    id: 1,
    list: "甲",
    lists: ["甲", "乙"],
    categories: ["甲", "乙"],
  };
  const renamed = changeList([task], "甲", "新甲")[0];
  assert.deepEqual(renamed.lists, ["新甲", "乙"]);
  assert.deepEqual(renamed.categories, renamed.lists);
  const removed = changeList([renamed], "新甲", null)[0];
  assert.equal(removed.list, "乙");
  assert.equal(changeList([removed], "乙", null)[0].list, "收件箱");
  assert.deepEqual(taskLists(withLists(task, ["丙"])), ["丙"]);
});
test("each quadrant move lands in exactly that quadrant and finished tasks are excluded", () => {
  for (const name of ["重要且紧急", "重要不紧急", "不重要但紧急", "其他"]) {
    const moved = moveTaskTo(
      { id: 1, priority: "低", date: "2027-01-01" },
      name,
      today,
    );
    assert.equal(quadrantOf(moved, today), name);
    assert.equal(
      toolGroups([moved], "matrix", today).filter(
        ([, tasks]) => tasks.length,
      )[0][0],
      name,
    );
  }
  assert.equal(
    toolGroups(
      [{ id: 2, done: true, priority: "高" }],
      "matrix",
      today,
    ).flatMap(([, tasks]) => tasks).length,
    0,
  );
});
test("timeline assigns every unfinished task once, including overdue and unscheduled", () => {
  const tasks = [
    { id: 1, date: "" },
    { id: 2, date: "2026-09-12" },
    { id: 3, date: today },
    { id: 4, date: "2026-09-14" },
    { id: 5, date: "2027-01-01" },
    { id: 6, done: true },
  ];
  const groups = toolGroups(tasks, "timeline", today);
  assert.deepEqual(
    groups.map(([, tasks]) => tasks.map((t) => t.id)),
    [[2], [3], [4], [5], [1]],
  );
});
test("board separates abandoned, finished, pending and in-progress; pin ordering works", () => {
  const tasks = [
    { id: 1, status: "abandoned", done: true },
    { id: 2, status: "done", done: true },
    { id: 3, status: "pending" },
    { id: 4, status: "in-progress" },
  ];
  assert.deepEqual(
    toolGroups(tasks, "kanban", today).map(([, items]) =>
      items.map((t) => t.id),
    ),
    [[3], [4], [2], [1]],
  );
  assert.deepEqual(
    selectTasks([{ id: 1 }, { id: 2, pinned: true }]).map((t) => t.id),
    [2, 1],
  );
});
test("legacy subtasks migrate without dropping checked objects or duplicate titles", () => {
  const items = normalizeSubtasks({
    subtasks: [
      "第一步",
      "第一步",
      { id: "existing", title: "已完成", done: true },
    ],
  });
  assert.equal(items.length, 3);
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[2].done, true);
  assert.equal(normalizeSubtasks({ subtasks: items })[0].title, "第一步");
});
