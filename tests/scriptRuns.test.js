import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRefresh, isActiveRun, runStatusLabel, runDuration, runTerminalUrl } from '../src/utils/scriptRuns.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('a late snapshot is serialized before a new event refresh', async () => {
  const first = deferred();
  let calls = 0;
  const snapshots = [];
  const refresh = createRunRefresh({
    read: () => ++calls === 1 ? first.promise : Promise.resolve([{ id: 'new', status: 'running' }]),
    onData: data => snapshots.push(data), onError: error => assert.fail(error),
  });
  const pending = refresh.refresh();
  refresh.refresh();
  refresh.refresh();
  assert.equal(calls, 1);
  first.resolve([{ id: 'old', status: 'stopped' }]);
  await pending;
  assert.equal(calls, 2);
  assert.deepEqual(snapshots.at(-1), [{ id: 'new', status: 'running' }]);
});

test('IPC failure preserves the last snapshot and a later refresh recovers', async () => {
  let fail = false, snapshot = [], error = null;
  const refresh = createRunRefresh({
    read: async () => { if (fail) throw new Error('IPC unavailable'); return [{ id: 'live', status: 'running' }]; },
    onData: data => { snapshot = data; error = null; }, onError: value => { error = value; },
  });
  await refresh.refresh();
  fail = true;
  await refresh.refresh();
  assert.equal(snapshot[0].id, 'live');
  assert.match(error, /IPC unavailable/);
  fail = false;
  await refresh.refresh();
  assert.equal(error, null);
});

test('disposal prevents a pending query from publishing after cleanup', async () => {
  const read = deferred();
  const refresh = createRunRefresh({ read: () => read.promise, onData: () => assert.fail('stale update'), onError: () => assert.fail('stale error') });
  const pending = refresh.refresh();
  refresh.dispose();
  read.resolve([]);
  await pending;
  await refresh.refresh();
});

test('restart remains active while its old process has exited; finished durations freeze', () => {
  const run = { status: 'stopped', restartPending: true, startedAt: 1000, endedAt: 62000 };
  assert.equal(isActiveRun(run), true);
  assert.equal(runStatusLabel(run), '重启中');
  assert.equal(runDuration(run, 900000), '1 分 1 秒');
  assert.equal(isActiveRun({ ...run, restartPending: false }), false);
  assert.equal(runStatusLabel({ status: 'failed' }), '执行失败');
});

test('log navigation identifies an execution and preserves special characters in paths', () => {
  const url = runTerminalUrl({ id: 'script-42', project: { name: '前端 & 后端', path: '/work/中文 项目#1' }, command: { name: 'dev:local' } });
  const parsed = new URL(url, 'http://localhost');
  assert.equal(parsed.pathname, '/terminal');
  assert.equal(parsed.searchParams.get('sessionId'), 'script-42');
  assert.equal(parsed.searchParams.get('cwd'), '/work/中文 项目#1');
  assert.equal(parsed.searchParams.get('title'), '前端 & 后端-dev:local');
});
