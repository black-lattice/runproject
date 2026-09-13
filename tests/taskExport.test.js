import test from "node:test";
import assert from "node:assert/strict";
import {
  createTaskExportSnapshot,
  exportTaskDate,
  exportTaskStatus,
  taskExportText,
} from "../src/utils/taskExport.js";

test("export snapshot retains all readable task fields but never file bodies or mutable references", () => {
  const task = {
    id: "a",
    title: "发布计划",
    date: "2026-09-15",
    time: "09:30",
    lists: ["工作", "发布"],
    priority: "高",
    status: "in-progress",
    tags: ["版本"],
    detail: "第一行\n第二行",
    reminder: "提前10分钟",
    repeat: "每周",
    subtasks: ["旧步骤", { id: "child", title: "构建", done: true }],
    attachments: [
      {
        id: "file",
        name: "说明.pdf",
        dataUrl: "data:application/pdf;base64,SECRET",
      },
    ],
    comments: [{ id: "comment", text: "完成审核", at: 1000 }],
    activity: [{ message: "PRIVATE_ACTIVITY" }],
  };
  const snapshot = createTaskExportSnapshot({
    title: "工作 · 当前筛选",
    tasks: [task],
    now: "2026-09-13T08:00:00Z",
  });
  task.tags.push("后续标签");
  task.subtasks[1].title = "新的标题";
  task.attachments[0].name = "后来.pdf";
  assert.equal(snapshot.capturedAt, "2026-09-13T08:00:00.000Z");
  assert.deepEqual(snapshot.tasks[0].tags, ["版本"]);
  assert.equal(snapshot.tasks[0].subtasks[1].title, "构建");
  assert.deepEqual(snapshot.tasks[0].attachments, ["说明.pdf"]);
  const output = taskExportText(snapshot);
  for (const value of [
    "工作 · 当前筛选",
    "发布计划",
    "进行中",
    "2026-09-15 09:30",
    "工作、发布",
    "优先级：高",
    "#版本",
    "第一行\n第二行",
    "[ ] 旧步骤",
    "[x] 构建",
    "说明.pdf",
    "完成审核",
    "提前10分钟",
    "每周",
  ])
    assert.ok(output.includes(value), value);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /SECRET|dataUrl|PRIVATE_ACTIVITY/,
  );
  assert.match(output, /当前视图快照，共 1 项任务/);
});

test("long notes and unusual characters are preserved as literal text without truncation", () => {
  const detail = `<script>alert("x")</script>\n${"长备注 < > & \" '\n".repeat(12000)}结尾标记`;
  const snapshot = createTaskExportSnapshot({
    title: "<导出>&",
    tasks: [{ title: "<img src=x onerror=alert(1)>", detail }],
    now: 0,
  });
  assert.equal(snapshot.tasks[0].detail, detail);
  const output = taskExportText(snapshot);
  assert.ok(output.includes(detail));
  assert.ok(output.includes("结尾标记"));
  assert.ok(output.includes("<img src=x onerror=alert(1)>"));
});

test("export handles legacy task shapes, unfinished states and empty views", () => {
  assert.equal(exportTaskStatus({ done: true, status: "abandoned" }), "已放弃");
  assert.equal(exportTaskStatus({ done: true }), "已完成");
  assert.equal(exportTaskStatus({ status: "done" }), "已完成");
  assert.equal(exportTaskStatus({}), "待处理");
  const snapshot = createTaskExportSnapshot({
    tasks: [
      null,
      { categories: ["旧清单"], subtasks: [null, "旧子任务"], deleted: true },
    ],
    now: 0,
  });
  assert.deepEqual(snapshot.tasks[0].lists, ["旧清单"]);
  assert.equal(snapshot.tasks[0].title, "未命名任务");
  assert.match(taskExportText(snapshot), /待处理（回收站）/);
  assert.equal(exportTaskDate({ date: "2026-09-13" }), "2026-09-13 · 全天");
  assert.equal(exportTaskDate({}), "未安排日期");
  assert.match(
    taskExportText(createTaskExportSnapshot({ tasks: [], now: 0 })),
    /当前视图没有任务/,
  );
});
