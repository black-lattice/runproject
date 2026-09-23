import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { trayProjects } from '../src/utils/trayProjects.js';
import * as scriptRuns from '../src/utils/scriptRuns.js';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const source = transformSync(readFileSync(new URL('../src/components/TrayPanel/TrayProjects.jsx', import.meta.url), 'utf8'), {
  loader: 'jsx', jsx: 'automatic', format: 'cjs',
}).code;
const project = { name: 'RunProject', path: '/projects/runproject', commands: [{ name: 'dev', script: 'vite' }] };

function fixture(invoke) {
  let cursor = 0, refreshCount = 0;
  const slots = [];
  const store = { runs: [], loading: false, error: null, refresh: async () => { refreshCount++; } };
  const snapshot = { loading: false, error: null, refresh() {}, data: {
    workspaces: [{ projects: [project] }], commandTags: { [`${project.path}::dev`]: ['开发'] },
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, require(name) {
    if (name === 'react') return {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], update => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; }];
      },
      useRef(initial) {
        const index = cursor++;
        return slots[index] ??= { current: initial };
      },
    };
    if (name === '@tauri-apps/api/core') return { invoke };
    if (name === '@/store/useScriptRunStore') return { useScriptRunStore: () => store };
    if (name === '@/utils/scriptRuns') return scriptRuns;
    if (name === '@/utils/trayProjects') return { trayProjects };
    if (name === './useTrayProjects') return { default: () => snapshot, __esModule: true };
    if (name.endsWith('.css')) return {};
    return require(name);
  } });
  const render = () => { cursor = 0; return module.exports.default(); };
  return { render, store, snapshot, get refreshCount() { return refreshCount; } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const launch = env => nodes(env.render()).find(node => node.props?.['aria-label'] === '启动 RunProject dev');

test('quick launch passes project and command name, ignores double clicks and refreshes runs', async () => {
  let resolve;
  const calls = [];
  const env = fixture((command, args) => {
    calls.push({ command, ...args });
    return new Promise(done => { resolve = done; });
  });
  const button = launch(env);
  const first = button.props.onClick();
  await button.props.onClick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { command: 'start_project_script', projectPath: project.path, script: 'dev' });
  assert.equal(launch(env).props.disabled, true);
  resolve({ status: 'running' });
  await first;
  assert.equal(env.refreshCount, 1);
  assert.ok(nodes(env.render()).some(node => node.props?.role === 'status' && node.props.children === '已启动'));
});

test('failed starts show an error and re-enable the command for retry', async () => {
  let calls = 0;
  const env = fixture(async () => { calls++; if (calls === 1) throw new Error('项目路径不可用'); return { status: 'running' }; });
  await launch(env).props.onClick();
  assert.equal(launch(env).props.disabled, false);
  assert.ok(nodes(env.render()).some(node => node.props?.role === 'alert' && node.props.children.includes('项目路径不可用')));
  await launch(env).props.onClick();
  assert.equal(calls, 2);
  assert.ok(!nodes(env.render()).some(node => node.props?.role === 'alert'));
});

test('running commands and stale snapshots disable launching', () => {
  const env = fixture(async () => { throw new Error('must not launch'); });
  env.store.runs = [{ project, command: { name: 'dev' }, status: 'running' }];
  assert.equal(launch(env).props.disabled, true);
  env.store.runs = [];
  env.snapshot.error = '数据库读取失败';
  assert.equal(launch(env).props.disabled, true);
  env.snapshot.error = null;
  env.store.error = '状态同步失败';
  assert.equal(launch(env).props.disabled, true);
});
