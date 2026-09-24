import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTaskRecurrence,
  nextOccurrenceDate,
  resetTaskRecurrence,
} from "../src/utils/taskRecurrence.js";
const today = "2026-09-13";
const task = {
  id: "task-1",
  title: "每日计划",
  date: today,
  repeat: "每天",
  status: "pending",
  done: false,
};
const complete = (before, options = { today, now: 100 }) =>
  applyTaskRecurrence(
    [before],
    [{ ...before, done: true, status: "done" }],
    options,
  );

test("completion creates one pending successor and retains all custom task fields", () => {
  const original = {
    ...task,
    detail: "备注",
    lists: ["工作", "生活"],
    custom: { keep: true },
    time: "09:30",
    reminder: "2026-09-12T09:00",
    reminderNotified: "old",
    reminderAcknowledged: "old",
    completedAt: 5,
    subtasks: [
      "旧子任务",
      {
        id: "sub",
        title: "完成子任务",
        done: true,
        note: "保留",
        subtasks: [{ title: "嵌套", done: true }],
      },
    ],
  };
  const [next, source] = complete(original);
  assert.equal(next.date, "2026-09-14");
  assert.equal(next.done, false);
  assert.equal(next.status, "pending");
  assert.equal(source.recurrenceNextId, next.id);
  assert.deepEqual(next.custom, original.custom);
  assert.deepEqual(next.lists, original.lists);
  assert.equal(next.reminder, "2026-09-13T09:00");
  assert.equal(next.reminderNotified, "");
  assert.equal(next.reminderAcknowledged, "");
  assert.equal(next.completedAt, undefined);
  assert.equal(next.subtasks[1].note, "保留");
  assert.equal(next.subtasks[1].done, false);
  assert.equal(next.subtasks[1].subtasks[0].done, false);
  assert.notEqual(next.subtasks[1].id, "sub");
  assert.equal(original.recurrenceNextId, undefined);
  assert.equal(original.subtasks[1].done, true);
});
test("undo/recomplete keeps edited successor and permanent deletion does not resurrect it", () => {
  const [next, source] = complete(task);
  const edited = { ...next, title: "我调整了后续任务", date: "2026-09-20" };
  const undone = applyTaskRecurrence(
    [next, source],
    [edited, { ...source, done: false, status: "pending" }],
    { today },
  );
  const redone = applyTaskRecurrence(
    undone,
    [edited, { ...undone[1], done: true, status: "done" }],
    { today },
  );
  assert.equal(redone.length, 2);
  assert.deepEqual(redone[0], edited);
  const erased = applyTaskRecurrence(
    redone,
    [
      {
        ...source,
        done: false,
        status: "pending",
        recurrenceNextId: undefined,
      },
    ],
    { today },
  );
  assert.equal(complete(erased[0]).length, 1);
});
test("status changes, abandoned tasks, trash and completed imports never backfill occurrences", () => {
  for (const next of [
    { ...task, status: "abandoned", done: true },
    { ...task, status: "in-progress" },
    { ...task, done: true, deleted: true },
  ])
    assert.equal(applyTaskRecurrence([task], [next], { today }).length, 1);
  assert.equal(
    complete({ ...task, status: "abandoned", done: true }).length,
    2,
  );
  assert.equal(
    applyTaskRecurrence([], [{ ...task, done: true }], { today }).length,
    1,
  );
  assert.equal(complete({ ...task, done: true }).length, 1);
  assert.equal(complete({ ...task, repeat: "不支持" }).length, 1);
});
test("duplicate generated ID is preserved instead of overwriting a concurrently edited instance", () => {
  const [next] = complete(task);
  const edited = { ...next, title: "另一端编辑" };
  const values = applyTaskRecurrence(
    [task],
    [edited, { ...task, done: true }],
    { today },
  );
  assert.equal(values.length, 2);
  assert.deepEqual(values[0], edited);
  assert.equal(values[1].recurrenceNextId, next.id);
});
test("daily and weekly skip missed occurrences but preserve weekly cadence", () => {
  assert.equal(
    nextOccurrenceDate({ ...task, date: "2026-08-01" }, today),
    "2026-09-14",
  );
  assert.equal(
    nextOccurrenceDate({ ...task, date: "2026-09-01", repeat: "每周" }, today),
    "2026-09-15",
  );
  assert.equal(
    nextOccurrenceDate(
      { ...task, date: "2026-09-01", repeat: "每周一" },
      today,
    ),
    "2026-09-14",
  );
  assert.equal(
    nextOccurrenceDate(
      { ...task, date: "2026-09-07", repeat: "每周一" },
      "2026-09-14",
    ),
    "2026-09-14",
  );
  assert.equal(
    nextOccurrenceDate(
      { ...task, date: "2026-09-14", repeat: "每周一" },
      "2026-09-14",
    ),
    "2026-09-21",
  );
  assert.equal(nextOccurrenceDate({ ...task, date: "" }, today), "2026-09-14");
  assert.equal(
    nextOccurrenceDate({ ...task, date: "2027-01-01" }, today),
    "2027-01-02",
  );
});
test("monthly cadence clamps leap and short months then returns to original day", () => {
  for (const [year, feb] of [
    [2024, "29"],
    [2025, "28"],
  ]) {
    const january = { ...task, date: `${year}-01-31`, repeat: "每月" };
    const [february] = complete(january, { today: january.date });
    assert.equal(february.date, `${year}-02-${feb}`);
    const [march] = complete(february, { today: february.date });
    assert.equal(march.date, `${year}-03-31`);
    const [shifted] = complete(
      { ...february, date: `${year}-02-20` },
      { today: `${year}-02-20` },
    );
    assert.equal(shifted.date, `${year}-03-20`);
  }
  assert.equal(
    nextOccurrenceDate(
      { ...task, date: "2024-01-31", repeat: "每月" },
      "2026-09-13",
    ),
    "2026-09-30",
  );
  assert.equal(
    nextOccurrenceDate(
      { ...task, date: "2024-01-31", repeat: "每月" },
      "2026-10-01",
    ),
    "2026-10-31",
  );
  assert.equal(
    nextOccurrenceDate({ ...task, date: "9999-12-31" }, "9999-12-31"),
    "",
  );
});
test("numeric and Unicode IDs have deterministic bounded series IDs across generations", () => {
  const [next] = complete({ ...task, id: "欢迎" });
  assert.equal(next.id, "recurrence:e6aca2e8bf8e:1");
  const [third] = complete(next);
  assert.equal(third.id, "recurrence:e6aca2e8bf8e:2");
  assert.equal(complete({ ...task, id: 12 })[0].id, "recurrence:3132:1");
  const reset = resetTaskRecurrence(third);
  assert.equal(reset.recurrenceRootId, undefined);
  assert.equal(reset.repeat, "每天");
});
