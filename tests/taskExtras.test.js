import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTaskActivity,
  attachmentBytes,
  createTaskFromTemplate,
  insertNoteFormat,
  makeTaskTemplate,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
  readTaskTemplates,
  validateAttachmentBatch,
  writeTaskTemplates,
} from "../src/utils/taskExtras.js";

test("activity records task lifecycle and meaningful changes without metadata feedback loops", () => {
  const initial = {
    id: "task",
    title: "购买材料",
    list: "收件箱",
    done: false,
  };
  const created = appendTaskActivity([], [initial], 1000)[0];
  assert.equal(created.activity[0].message, "创建任务");
  const changed = appendTaskActivity(
    [created],
    [
      {
        ...created,
        date: "2026-09-14",
        time: "09:00",
        status: "done",
        done: true,
        attachments: [{ id: "file", name: "清单.txt", size: 2 }],
        subtasks: [{ id: "child", title: "确认数量", done: true }],
      },
    ],
    2000,
  )[0];
  assert.match(changed.activity.at(-1).message, /状态改为已完成/);
  assert.match(changed.activity.at(-1).message, /2026-09-14 09:00/);
  assert.match(changed.activity.at(-1).message, /更新子任务（1\/1 已完成）/);
  assert.match(changed.activity.at(-1).message, /更新附件（1 个）/);
  const metadataOnly = {
    ...changed,
    reminderDeliveredAt: 3000,
    updatedAt: 3000,
  };
  assert.equal(
    appendTaskActivity([changed], [metadataOnly], 3000)[0],
    metadataOnly,
  );
  const deleted = appendTaskActivity(
    [changed],
    [{ ...changed, deleted: true }],
    4000,
  )[0];
  assert.equal(deleted.activity.at(-1).message, "移入回收站");
  assert.equal(
    appendTaskActivity(
      [deleted],
      [{ ...deleted, deleted: false }],
      5000,
    )[0].activity.at(-1).message,
    "从回收站恢复",
  );
});

test("editing bursts coalesce within five seconds while retaining later actions and bounded history", () => {
  const initial = { id: 1, title: "原文" };
  const first = appendTaskActivity(
    [initial],
    [{ ...initial, title: "修改" }],
    1000,
  )[0];
  const second = appendTaskActivity(
    [first],
    [{ ...first, title: "修改完毕" }],
    5000,
  )[0];
  assert.equal(second.activity.length, 1);
  assert.equal(second.activity[0].at, 5000);
  assert.equal(second.activity[0].id, first.activity[0].id);
  const third = appendTaskActivity(
    [second],
    [{ ...second, title: "另一次修改" }],
    10000,
  )[0];
  assert.equal(third.activity.length, 2);
  const filled = {
    ...third,
    activity: Array.from({ length: 110 }, (_, i) => ({
      id: i,
      at: i,
      message: `操作 ${i}`,
    })),
  };
  const trimmed = appendTaskActivity(
    [filled],
    [{ ...filled, pinned: true }],
    12000,
  )[0];
  assert.equal(trimmed.activity.length, 100);
  assert.equal(trimmed.activity.at(-1).message, "置顶任务");
  assert.equal(filled.activity.length, 110, "input data must stay immutable");
});

test("templates preserve reusable content but produce independent, fresh unfinished tasks", () => {
  const source = {
    id: "old",
    title: "发布检查",
    detail: "**检查**",
    list: "已删除清单",
    date: "2020-01-01",
    priority: "高",
    tags: ["发布"],
    done: true,
    deleted: true,
    pinned: true,
    repeat: "每天",
    reminder: "09:00",
    subtasks: [{ id: "old-child", title: "检查构建", done: true }],
    attachments: [{ dataUrl: "secret" }],
    activity: [{ message: "旧记录" }],
  };
  const template = makeTaskTemplate(source, "标准发布", 1000);
  assert.equal(template.name, "标准发布");
  const a = createTaskFromTemplate(template, { list: "工作", now: 2000 });
  const b = createTaskFromTemplate(template, { list: "工作", now: 2000 });
  assert.equal(a.title, source.title);
  assert.equal(a.detail, source.detail);
  assert.deepEqual(a.tags, source.tags);
  assert.deepEqual(a.lists, ["工作"]);
  assert.equal(a.date, "");
  assert.equal(a.reminder, "");
  assert.equal(a.repeat, "");
  assert.equal(a.done, false);
  assert.equal(a.deleted, false);
  assert.equal(a.pinned, false);
  assert.equal(a.subtasks[0].done, false);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.subtasks[0].id, b.subtasks[0].id);
  assert.deepEqual(a.attachments, []);
  assert.deepEqual(a.activity, []);
  a.tags.push("新的标签");
  assert.deepEqual(b.tags, ["发布"]);
  assert.throws(() => makeTaskTemplate(source, " "), /名称/);
});

test("template persistence reads legacy records and reports corrupt storage/quota failures", () => {
  const memory = {
    value: JSON.stringify([
      { title: "旧模板", detail: "笔记", subtasks: ["旧步骤"], savedAt: 1 },
    ]),
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
  const templates = readTaskTemplates(memory);
  assert.equal(templates[0].task.subtasks[0].title, "旧步骤");
  assert.equal(templates[0].name, "旧模板");
  writeTaskTemplates(memory, templates);
  assert.deepEqual(readTaskTemplates(memory), templates);
  memory.value = "{invalid";
  assert.throws(() => readTaskTemplates(memory), /原数据已保留/);
  assert.equal(memory.value, "{invalid");
  memory.value = "{}";
  assert.throws(() => readTaskTemplates(memory), /格式损坏/);
  assert.throws(
    () =>
      writeTaskTemplates(
        {
          setItem() {
            throw new Error("quota");
          },
        },
        templates,
      ),
    /空间不足/,
  );
  assert.throws(
    () => writeTaskTemplates(memory, Array(51).fill(templates[0])),
    /最多保存/,
  );
});

test("attachments enforce count and aggregate byte limits before reading", () => {
  validateAttachmentBatch([], [{ size: MAX_ATTACHMENT_BYTES }]);
  assert.throws(
    () =>
      validateAttachmentBatch([{ size: 1 }], [{ size: MAX_ATTACHMENT_BYTES }]),
    /总大小/,
  );
  assert.throws(
    () => validateAttachmentBatch(Array(5).fill({ size: 1 }), [{ size: 0 }]),
    /最多添加/,
  );
  assert.throws(() => validateAttachmentBatch([], [{ size: -1 }]), /无法读取/);
});

test("file reading persists bytes and corrupted data cannot be downloaded", async () => {
  class Reader {
    readAsDataURL() {
      this.result = "data:text/plain;base64,aGVsbG8=";
      this.onload();
    }
  }
  const attachment = await readAttachment(
    { name: "说明.txt", type: "text/plain", size: 5 },
    Reader,
  );
  assert.equal(attachment.name, "说明.txt");
  assert.equal(new TextDecoder().decode(attachmentBytes(attachment)), "hello");
  assert.throws(() => attachmentBytes({ ...attachment, size: 8 }), /损坏/);
  assert.throws(
    () => attachmentBytes({ ...attachment, dataUrl: "javascript:alert(1)" }),
    /损坏/,
  );
  class FailingReader {
    readAsDataURL() {
      this.onerror();
    }
  }
  await assert.rejects(
    () => readAttachment({ name: "丢失.txt", size: 1 }, FailingReader),
    /无法读取/,
  );
});

test("note formatting respects selections, line boundaries, empty placeholders and literal HTML", () => {
  const bold = insertNoteFormat("记录待办", 2, 4, "bold");
  assert.equal(bold.value, "记录**待办**");
  assert.equal(
    bold.value.slice(bold.selectionStart, bold.selectionEnd),
    "待办",
  );
  const heading = insertNoteFormat("记录待办", 2, 4, "heading");
  assert.equal(heading.value, "记录\n## 待办");
  const blank = insertNoteFormat("", 0, 0, "list");
  assert.equal(blank.value, "- 列表项");
  const html = "<img src=x onerror=alert(1)>";
  assert.equal(
    insertNoteFormat(html, 0, html.length, "code").value,
    `\`${html}\``,
  );
});
