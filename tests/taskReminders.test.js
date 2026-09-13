import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  newReminders,
  pendingReminders,
  upcomingReminders,
  reminderKey,
  reminderTime,
  markRemindersNotified,
  acknowledgeReminders,
  setTaskReminder,
  localDateTime,
  reminderSnapshot,
  updateReminderTasks,
  claimReminderNotifications,
  watchReminderClock,
} from "../src/utils/taskReminders.js";
const now = new Date("2026-09-13T14:00").getTime();
const due = { id: "due", title: "检查", reminder: "2026-09-13T13:59" };

test("reminders include overdue pending tasks, exclude finished/deleted/malformed", () => {
  const tasks = [
    due,
    { ...due, id: "done", done: true },
    { ...due, id: "abandoned", status: "abandoned" },
    { ...due, id: "deleted", deleted: true },
    { ...due, id: "bad", reminder: "今天 下午" },
    { ...due, id: "future", reminder: "2026-09-14T13:00" },
  ];
  assert.deepEqual(
    pendingReminders(tasks, now).map((task) => task.id),
    ["due"],
  );
  assert.deepEqual(
    upcomingReminders(tasks, now).map((task) => task.id),
    ["future"],
  );
  assert.equal(upcomingReminders([{ ...due, reminder: "" }], -1).length, 0);
});
test("dates and times are validated before Date.parse can normalize invalid input", () => {
  for (const value of [
    "2026-02-29T09:00",
    "2026-02-30T09:00",
    "2026-04-31T09:00",
    "2026-00-01T09:00",
    "2026-13-01T09:00",
    "2026-09-00T09:00",
    "2026-09-13T24:00",
    "2026-09-13T09:60",
    "2026-09-13T09:00:60Z",
    "2026-09-13T09:00:00+24:00",
    "2026-09-13T09:00:00+08:60",
    "0000-01-01T09:00",
    "2026-9-13T09:00",
    "2026-09-13 09:00",
    "2026-09-13T09:00\n",
  ]) {
    assert.equal(reminderTime({ reminder: value }), null, value);
    assert.throws(() => setTaskReminder(due, value), undefined, value);
  }
  for (const value of [
    "2024-02-29T09:00",
    "2000-02-29T09:00",
    "2026-09-13T23:59:59",
    "0099-01-01T09:00",
    "2026-09-13T09:00Z",
    "2026-09-13T09:00:00.123+08:00",
  ])
    assert.notEqual(reminderTime({ reminder: value }), null, value);
  assert.equal(reminderTime({ reminder: "1900-02-29T09:00" }), null);
  assert.equal(
    reminderTime({ reminder: "2026-09-13T09:00:00.123+08:00" }),
    Date.UTC(2026, 8, 13, 1, 0, 0, 123),
  );
  assert.throws(() => setTaskReminder(due, undefined));
});
test("nonexistent daylight-saving wall time is rejected instead of moved one hour", () => {
  const moduleUrl = new URL("../src/utils/taskReminders.js", import.meta.url)
    .href;
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { reminderTime } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify([reminderTime({reminder:'2026-03-08T02:30'}),reminderTime({reminder:'2026-03-08T03:30'}),reminderTime({reminder:'2026-11-01T01:30'})]));`,
    ],
    { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" },
  );
  const [gap, after, ambiguous] = JSON.parse(result);
  assert.equal(gap, null);
  assert.equal(typeof after, "number");
  assert.equal(typeof ambiguous, "number");
});
test("delivery stays unread; persisted reload and replayed effects do not notify twice", () => {
  const keys = reminderSnapshot([due]);
  const first = claimReminderNotifications([due], keys, now);
  assert.equal(first.notifications.length, 1);
  const replay = claimReminderNotifications(first.tasks, keys, now);
  assert.equal(replay.notifications.length, 0);
  assert.equal(replay.tasks, first.tasks);
  const loaded = JSON.parse(JSON.stringify(first.tasks));
  assert.equal(newReminders(loaded, now).length, 0);
  assert.equal(pendingReminders(loaded, now).length, 1);
  const read = acknowledgeReminders(loaded, keys);
  assert.equal(pendingReminders(read, now).length, 0);
  assert.equal(acknowledgeReminders(read, keys), read);
});
test("rescheduling clears state while stale notification actions preserve the new reminder", () => {
  const oldKeys = reminderSnapshot([due]);
  const notified = {
    ...due,
    reminderNotified: reminderKey(due),
    reminderAcknowledged: reminderKey(due),
  };
  const later = setTaskReminder(notified, localDateTime(now + 600000));
  assert.equal(newReminders([later], now).length, 0);
  assert.equal(newReminders([later], now + 600001).length, 1);
  assert.equal(markRemindersNotified([later], oldKeys)[0], later);
  assert.equal(acknowledgeReminders([later], oldKeys)[0], later);
  assert.equal(
    updateReminderTasks([later], oldKeys, (task) =>
      setTaskReminder(task, localDateTime(now + 1200000)),
    )[0],
    later,
  );
  assert.equal(
    updateReminderTasks([later], oldKeys, (task) => ({
      ...task,
      done: true,
    }))[0],
    later,
  );
  assert.equal(
    claimReminderNotifications([later], oldKeys, now + 600001).notifications
      .length,
    0,
  );
  assert.equal(
    claimReminderNotifications([later], reminderSnapshot([later]), now + 600001)
      .notifications.length,
    1,
  );
  assert.equal(pendingReminders([setTaskReminder(due, "")], now).length, 0);
});
test("bulk acknowledgement affects only the currently matching reminders that were visible", () => {
  const second = { ...due, id: "second" };
  const third = { ...due, id: "third" };
  const keys = reminderSnapshot([due, second]);
  const changed = setTaskReminder(second, "2026-09-13T14:10");
  const result = acknowledgeReminders([due, changed, third], keys);
  assert.equal(result[0].reminderAcknowledged, reminderKey(due));
  assert.equal(result[1], changed);
  assert.equal(result[2], third);
  for (const task of [
    { ...due, done: true },
    { ...due, deleted: true },
    { ...due, status: "abandoned" },
  ])
    assert.equal(
      updateReminderTasks([task], keys, () => {
        throw new Error("inactive task mutated");
      })[0],
      task,
    );
});
test("re-entering the same schedule retains delivery/read state and numeric IDs match", () => {
  const task = {
    id: 12,
    reminder: "2026-09-13T09:00:00Z",
    reminderNotified: "kept",
    reminderAcknowledged: "kept",
  };
  assert.equal(setTaskReminder(task, task.reminder), task);
  const sameInstant = setTaskReminder(task, "2026-09-13T17:00:00+08:00");
  assert.equal(sameInstant.reminderNotified, "kept");
  assert.equal(sameInstant.reminderAcknowledged, "kept");
  assert.equal(
    markRemindersNotified([task], reminderSnapshot([task]))[0].reminderNotified,
    reminderKey(task),
  );
});
test("restoring focus, visibility or cached page checks actual wall time and cleanup removes listeners", () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.hidden = false;
  let clock = now - 120000,
    timerCallback,
    cleared;
  const observed = [];
  const stop = watchReminderClock((time) => observed.push(time), {
    windowTarget,
    documentTarget,
    readTime: () => clock,
    setTimer: (callback, interval) => {
      assert.equal(interval, 15000);
      timerCallback = callback;
      return 7;
    },
    clearTimer: (id) => {
      cleared = id;
    },
  });
  assert.equal(newReminders([due], observed.at(-1)).length, 0);
  clock = now;
  windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(newReminders([due], observed.at(-1)).length, 1);
  clock += 3600000;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(observed.at(-1), clock);
  clock -= 7200000;
  windowTarget.dispatchEvent(new Event("pageshow"));
  assert.equal(observed.at(-1), clock);
  assert.equal(
    claimReminderNotifications([due], reminderSnapshot([due]), observed.at(-1))
      .notifications.length,
    0,
  );
  clock += 3600000;
  timerCallback();
  assert.equal(observed.at(-1), clock);
  const count = observed.length;
  documentTarget.hidden = true;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(observed.length, count);
  stop();
  assert.equal(cleared, 7);
  windowTarget.dispatchEvent(new Event("focus"));
  windowTarget.dispatchEvent(new Event("pageshow"));
  documentTarget.hidden = false;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(observed.length, count);
});
