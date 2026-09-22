import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function load(file, imports, globals) {
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  vm.runInNewContext(code, { module, exports: module.exports, console: { log() {}, warn() {}, error() {} }, ...globals, require: name => imports[name] ?? require(name) });
  return module.exports;
}

function terminalHarness({ id = 'terminal-1', alive = true, delayedListen = false } = {}) {
  const effects = [], listeners = {}, calls = [], output = [], pendingListen = deferred();
  let heartbeat, closed = 0, disposed = 0;
  let fit = 0;
  class FakeTerminal {
    constructor() { this.cols = 80; this.rows = 24; }
    loadAddon() {} open() {} write(text) { output.push(text); }
    onData() { return { dispose() {} }; } dispose() { disposed++; }
  }
  const module = load('src/components/Terminal/XtermTerminal.jsx', {
    react: { useEffect: effect => effects.push(effect), useRef: value => ({ current: value }) },
    'react/jsx-runtime': require('react/jsx-runtime'),
    xterm: { Terminal: FakeTerminal }, '@xterm/addon-fit': { FitAddon: class { fit() { fit++; } } },
    '@tauri-apps/api/core': { invoke: async (command, args) => {
      calls.push({ command, args });
      if (command === 'resize_terminal' && !alive) throw new Error('会话不存在');
      if (command === 'ping_terminal_session') return alive;
      if (command === 'get_terminal_buffer') return Buffer.from('历史日志\r\n').toString('base64');
    } },
    '@tauri-apps/api/event': { emit() {}, listen: async (name, handler) => {
      if (delayedListen) await pendingListen.promise;
      listeners[name] = handler;
      return () => delete listeners[name];
    } },
    '@/store/useAppStore': { useAppStore: { getState: () => ({ runningCommands: {} }) } },
    '@/components/AppTheme': { useAppAppearance: () => ({ isDark: true }) },
    './useTerminalViewport': { __esModule: true, default: () => () => { fit++; return true; }, terminalTheme: () => ({}) },
    'xterm/css/xterm.css': {},
  }, {
    atob, btoa, TextDecoder, TextEncoder, Uint8Array,
    requestAnimationFrame: callback => { queueMicrotask(callback); return 1; },
    setInterval: callback => { heartbeat = callback; return 1; }, clearInterval: () => { heartbeat = null; },
  });
  const tree = module.default({ sessionId: id, cwd: '/项目', existingSession: true, onClose: () => closed++ });
  tree.props.ref.current = {};
  const cleanup = effects.map(effect => effect());
  return { calls, output, listeners, pendingListen, cleanup: () => cleanup.forEach(fn => fn?.()), heartbeat: () => heartbeat?.(), closed: () => closed, disposed: () => disposed, fit: () => fit };
}

test('attaching and remounting a live terminal restores logs without spawning or closing a PTY', async () => {
  for (let i = 0; i < 2; i++) {
    const env = terminalHarness();
    await tick();
    assert.ok(env.output.some(text => text.includes('历史日志')));
    assert.equal(env.calls.filter(call => call.command === 'create_terminal_session').length, 0);
    env.cleanup();
    assert.equal(env.calls.filter(call => call.command === 'close_terminal_session').length, 0);
    assert.equal(Object.keys(env.listeners).length, 0);
    assert.equal(env.disposed(), 1);
  }
});

test('an ended managed script still loads logs; an expired shell never silently respawns', async () => {
  const script = terminalHarness({ id: 'script-1', alive: false });
  await tick(); await script.heartbeat();
  assert.ok(script.output.some(text => text.includes('历史日志')));
  assert.equal(script.closed(), 0);
  assert.equal(script.calls.some(call => call.command === 'create_terminal_session'), false);
  script.cleanup();
  const shell = terminalHarness({ alive: false });
  await tick();
  assert.equal(shell.calls.some(call => call.command === 'create_terminal_session'), false);
  assert.ok(shell.output.some(text => text.includes('请新建终端')));
  shell.cleanup();
});

test('late event subscriptions are disposed when the user leaves before terminal attachment finishes', async () => {
  const env = terminalHarness({ delayedListen: true });
  await tick();
  env.cleanup();
  env.pendingListen.resolve();
  await tick();
  assert.equal(Object.keys(env.listeners).length, 0);
  assert.equal(env.calls.length, 0);
});

test('ResizeObserver fits a visible terminal to its container, ignores hidden terminals, and cleans up', async () => {
  const effects = [], observers = [], frames = new Map(), calls = [];
  let frameId = 0, fits = 0, focused = 0;
  const container = { clientWidth: 640, clientHeight: 220 };
  const terminal = { cols: 80, rows: 24, options: {}, focus: () => focused++ };
  const terminalRef = { current: terminal };
  const viewport = load('src/components/Terminal/useTerminalViewport.js', {
    react: { useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) },
    '@tauri-apps/api/core': { invoke: async (command, args) => calls.push({ command, args }) },
  }, {
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    requestAnimationFrame: callback => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({ backgroundColor: 'black', color: 'white' }),
    window: { addEventListener() {}, removeEventListener() {} },
  });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  const fitAddonRef = { current: { fit: () => { fits++; terminal.cols = 100; terminal.rows = 12; } } };
  viewport.default({ containerRef: { current: container }, terminalRef, fitAddonRef, sessionId: 'terminal-1', active: true, isDark: true });
  const cleanup = effects.splice(0).map(effect => effect());
  flush(); await tick();
  assert.equal(fits, 1); assert.equal(focused, 1);
  assert.equal(calls[0].args.rows, 12);
  container.clientHeight = 0;
  observers[0].callback(); flush();
  assert.equal(calls.length, 1);
  container.clientHeight = 300;
  observers[0].callback(); flush();
  assert.equal(calls.length, 2);
  cleanup.forEach(fn => fn?.());
  assert.equal(observers[0].disconnected, true);
});
