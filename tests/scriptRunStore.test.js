import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createRunRefresh } from '../src/utils/scriptRuns.js';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const source = transformSync(readFileSync(new URL('../src/store/useScriptRunStore.js', import.meta.url), 'utf8'), {
  format: 'cjs', define: { 'import.meta.hot': 'false' },
}).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function session(invoke) {
  const module = { exports: {} }, listeners = {};
  vm.runInNewContext(source, {
    module, exports: module.exports, console,
    window: { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'zustand') return require('zustand');
      if (name === '@tauri-apps/api/core') return { isTauri: () => true, invoke };
      if (name === '@tauri-apps/api/event') return { listen: async (event, handler) => { listeners[event] = handler; return () => {}; } };
      if (name === '@/utils/scriptRuns') return { createRunRefresh };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  module.exports.startScriptRunSync();
  await tick();
  return { store: module.exports.useScriptRunStore, listeners };
}

test('repeated restart clicks send one IPC request and refresh the authoritative snapshot', async () => {
  const pending = deferred();
  let calls = 0, runs = [{ id: 'old', status: 'running' }];
  const { store } = await session(async (command, args) => {
    if (command === 'list_script_runs') return runs;
    assert.equal(command, 'restart_project_script');
    assert.equal(args.runId, 'old');
    calls++;
    return pending.promise;
  });
  const run = store.getState().runs[0];
  const operation = store.getState().perform(run, 'restart');
  await store.getState().perform(run, 'restart');
  assert.equal(calls, 1);
  assert.equal(store.getState().pending.old, 'restart');
  runs = [{ id: 'new', status: 'running' }, { id: 'old', status: 'stopped', restartedAs: 'new' }];
  pending.resolve(runs[0]);
  await operation;
  assert.equal(store.getState().runs[0].id, 'new');
  assert.equal(store.getState().pending.old, undefined);
});

test('a stop error retains running state and permits a retry', async () => {
  let fail = true;
  const run = { id: 'live', status: 'running' };
  const { store } = await session(async command => {
    if (command === 'list_script_runs') return [run];
    if (fail) throw new Error('无法停止进程');
    run.status = 'stopped';
    return run;
  });
  await assert.rejects(store.getState().perform(run, 'stop'), /无法停止/);
  assert.equal(store.getState().runs[0].status, 'running');
  assert.match(store.getState().actionErrors.live, /无法停止/);
  assert.equal(store.getState().pending.live, undefined);
  fail = false;
  await store.getState().perform(run, 'stop');
  assert.equal(store.getState().runs[0].status, 'stopped');
  assert.equal(store.getState().actionErrors.live, null);
});

test('native status events refresh ended runs even without navigating to the terminal', async () => {
  let runs = [{ id: 'live', status: 'running' }];
  const { store, listeners } = await session(async () => runs);
  runs = [{ id: 'live', status: 'failed', exitCode: 7 }];
  await listeners['script-run-updated']();
  assert.equal(store.getState().runs[0].exitCode, 7);
  assert.equal(store.getState().runs[0].status, 'failed');
  assert.equal(store.getState().error, null);
});
