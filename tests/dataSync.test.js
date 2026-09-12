import test from "node:test";
import assert from "node:assert/strict";
import { createSyncedData } from "../src/utils/syncedData.js";
import { mergeData } from "../src/utils/mergeData.js";
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const original = { tasks: [{ id: 1, title: "old", done: false }], lists: [] };
test("merges status and UI edits without removing concurrent additions", () => {
  const local = {
    ...original,
    tasks: [{ ...original.tasks[0], title: "new" }],
  };
  const remote = {
    tasks: [
      { ...original.tasks[0], done: true },
      { id: "mcp-id", title: "MCP" },
    ],
    lists: [["work", "0"]],
  };
  assert.deepEqual(mergeData(original, local, remote), {
    ...remote,
    tasks: [{ id: 1, title: "new", done: true }, remote.tasks[1]],
  });
});
test("does not resurrect removed workspaces on stale edits", () => {
  assert.deepEqual(
    mergeData(
      { workspaces: [{ path: "/a", name: "old" }] },
      { workspaces: [{ path: "/a", name: "new" }] },
      { workspaces: [] },
    ),
    { workspaces: [] },
  );
});
test("serializes saves and preserves edits made while a save is in flight", async () => {
  let database = structuredClone(original),
    calls = 0;
  const gate = deferred();
  const sync = createSyncedData({
    initial: original,
    empty: { tasks: [], lists: [] },
    read: async () => ({ initialized: true, data: structuredClone(database) }),
    write: async (data, base) => {
      calls++;
      if (calls === 1) await gate.promise;
      database = mergeData(base, data, database);
      return structuredClone(database);
    },
  });
  sync.start();
  await tick();
  sync.update((data) => ({
    ...data,
    tasks: [{ ...data.tasks[0], title: "first" }],
  }));
  await tick();
  sync.update((data) => ({
    ...data,
    tasks: [{ ...data.tasks[0], title: "second" }],
  }));
  database.tasks[0].done = true;
  database.tasks.push({ id: "mcp", title: "external" });
  sync.refresh();
  gate.resolve();
  await tick();
  assert.equal(database.tasks[0].title, "second");
  assert.equal(database.tasks[0].done, true);
  assert.equal(database.tasks.length, 2);
  assert.deepEqual(sync.getSnapshot().data, database);
  assert.equal(calls, 2);
});
test("does not write initial placeholders over existing database data", async () => {
  let writes = 0;
  const sync = createSyncedData({
    initial: original,
    empty: {},
    read: async () => ({ initialized: true, data: { tasks: [], lists: [] } }),
    write: async () => {
      writes++;
    },
  });
  sync.start();
  sync.start();
  await tick();
  assert.equal(writes, 0);
  assert.deepEqual(sync.getSnapshot().data, { tasks: [], lists: [] });
});
test("retains failed edits and retries them", async () => {
  let fails = true,
    database = structuredClone(original);
  const sync = createSyncedData({
    initial: original,
    empty: {},
    read: async () => ({ initialized: true, data: structuredClone(database) }),
    write: async (data) => {
      if (fails) throw new Error("temporary");
      database = data;
      return data;
    },
  });
  sync.start();
  await tick();
  sync.update((data) => ({ ...data, lists: [["new", "0"]] }));
  await tick();
  assert.equal(sync.getSnapshot().status, "error");
  assert.equal(sync.getSnapshot().data.lists.length, 1);
  fails = false;
  sync.refresh();
  await tick();
  assert.equal(sync.getSnapshot().status, "ready");
  assert.deepEqual(database.lists, [["new", "0"]]);
});

test("browser quota failure keeps edits visible and retry persists the combined snapshot", async () => {
  let blocked=false,persisted,reported=0;
  const sync=createSyncedData({initial:original,empty:{},read:null,cache:data=>{if(blocked)throw new Error('quota');persisted=structuredClone(data);},onError:()=>reported++});
  sync.start();blocked=true;
  sync.update(data=>({...data,lists:[['保留的新清单','0']]}));
  assert.equal(sync.getSnapshot().status,'error');assert.equal(sync.getSnapshot().data.lists[0][0],'保留的新清单');assert.ok(reported);
  blocked=false;await sync.refresh();
  assert.equal(sync.getSnapshot().status,'local');assert.equal(persisted.lists[0][0],'保留的新清单');
});
