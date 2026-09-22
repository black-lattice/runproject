import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture(saved = null) {
  const storage = new Map(saved ? [['terminal_page_state', JSON.stringify(saved)]] : []);
  const window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  function load(file, imports = {}, globals = {}) {
    const module = { exports: {} };
    const code = transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { format: 'cjs', loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic' }).code;
    vm.runInNewContext(code, { module, exports: module.exports, window, console, crypto: { randomUUID: () => 'unique-id' }, ...globals,
      require: name => imports[name] ?? require(name),
    });
    return module.exports;
  }
  const sessions = load('src/utils/terminalPageState.js');
  const panel = load('src/store/useTerminalPanelStore.js', { '@/utils/terminalPageState': sessions });
  return { storage, window, load, sessions, panel };
}

function controller(env, invoke, options = {}, dialog = async () => null) {
  const notices = [], effects = [], events = {};
  const api = env.load('src/hooks/useTerminalSessions.js', {
    react: {
      useSyncExternalStore: (_, read) => read(), useRef: value => ({ current: value }),
      useState: initial => { let value = initial; return [value, next => { value = typeof next === 'function' ? next(value) : next; }]; },
      useEffect: effect => effects.push(effect),
    },
    '@tauri-apps/api/core': { invoke, isTauri: () => true },
    '@tauri-apps/api/event': { listen: async (name, handler) => { events[name] = handler; return () => delete events[name]; } },
    '@tauri-apps/api/path': { homeDir: async () => '/home/user' },
    '@tauri-apps/plugin-dialog': { open: dialog },
    '@/hooks/use-toast': { useToast: () => ({ toast: notice => notices.push(notice) }) },
    '@/utils/terminalPageState': env.sessions,
  }).default(options);
  const cleanup = effects.map(effect => effect());
  return { api, notices, events, cleanup: () => cleanup.forEach(fn => fn?.()) };
}

test('page and dock share one snapshot; repeats merge by ID and closing selects a remaining session', () => {
  const env = fixture({ terminals: [{ id: 'a', cwd: '/中文 项目' }, { id: 'a', cwd: '/duplicate' }, null], activeTerminalId: 'missing' });
  const { sessions } = env;
  assert.equal(sessions.readTerminalPageState().terminals.length, 1);
  assert.equal(sessions.readTerminalPageState().activeTerminalId, 'a');
  assert.equal(sessions.readTerminalPageState(), sessions.readTerminalPageState());
  let updates = 0;
  const unsubscribe = sessions.subscribeTerminalPageState(() => updates++);
  sessions.upsertTerminalPageSession({ id: 'a', cwd: '/中文 项目', title: '脚本日志' });
  sessions.upsertTerminalPageSession({ id: 'b', cwd: '/other', title: 'Shell' });
  sessions.selectTerminalPageSession('a');
  sessions.removeTerminalPageSession('a');
  assert.equal(sessions.readTerminalPageState().activeTerminalId, 'b');
  assert.equal(updates, 4);
  assert.equal(JSON.parse(env.storage.get('terminal_page_state')).terminals.length, 1);
  unsubscribe();
  sessions.removeTerminalPageSession('b');
  assert.equal(env.storage.has('terminal_page_state'), false);
  assert.equal(sessions.readTerminalPageState().activeTerminalId, null);
});

test('hiding and reopening retains the exact sessions, selected ID and saved height', () => {
  const { panel, sessions, storage } = fixture();
  panel.openProjectTerminal({ id: 'script-1', cwd: '/project', title: 'dev' });
  const state = sessions.readTerminalPageState();
  panel.useTerminalPanelStore.getState().setHeight(360);
  panel.useTerminalPanelStore.getState().hide();
  assert.equal(panel.useTerminalPanelStore.getState().visible, false);
  assert.equal(sessions.readTerminalPageState(), state);
  panel.useTerminalPanelStore.getState().show();
  assert.equal(sessions.readTerminalPageState(), state);
  assert.equal(storage.get('project-terminal-height'), '360');
  assert.equal(panel.clampTerminalHeight(5000, 600), 460);
  assert.equal(panel.clampTerminalHeight(10, 600), 160);
  assert.equal(panel.clampTerminalHeight(300, 260), 120);
  assert.equal(panel.clampTerminalHeight(NaN, 600), 300);
});

test('new shell uses selected project directory and is only published after one native creation completes', async () => {
  const env = fixture(), creation = deferred(), calls = [];
  const { api } = controller(env, async (command, args) => { calls.push({ command, args }); return creation.promise; }, { cwd: '/项目 with spaces', title: '项目' });
  const first = api.addTerminal();
  await api.addTerminal();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'create_terminal_session');
  assert.equal(calls[0].args.config.cwd, '/项目 with spaces');
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 0);
  creation.resolve(); await first;
  const terminal = env.sessions.readTerminalPageState().terminals[0];
  assert.equal(terminal.existingSession, true);
  assert.equal(terminal.title, '项目 · 终端');
});

test('cancelled directory selection and failed native creation do not leave phantom tabs', async () => {
  const env = fixture(); let calls = 0;
  const { api, notices } = controller(env, async () => { calls++; throw new Error('目录不存在'); });
  await api.addTerminal(true);
  assert.equal(calls, 0);
  await api.addTerminal();
  assert.equal(calls, 1);
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 0);
  assert.equal(notices[0].title, '新建终端失败');
});

test('failed or unconfirmed close retains the tab; a retry only removes it after the backend reports stopped', async () => {
  const env = fixture();
  env.sessions.upsertTerminalPageSession({ id: 'script-1', cwd: '/project' });
  let fail = true, alive = true;
  const { api, notices } = controller(env, async command => {
    if (command === 'close_terminal_session' && fail) throw new Error('停止失败');
    return command === 'ping_terminal_session' ? alive : undefined;
  });
  await api.closeTerminal('script-1');
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 1);
  fail = false;
  await api.closeTerminal('script-1');
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 1);
  assert.equal(notices.length, 2);
  alive = false;
  await api.closeTerminal('script-1');
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 0);
});

test('duplicate close clicks share a single native request and native shell exit removes the shared tab', async () => {
  const env = fixture(), stop = deferred(); let calls = 0;
  env.sessions.upsertTerminalPageSession({ id: 'terminal-1', cwd: '/project' });
  const { api, events, cleanup } = controller(env, async command => {
    if (command === 'close_terminal_session') { calls++; return stop.promise; }
    return false;
  });
  await tick();
  const first = api.closeTerminal('terminal-1');
  await api.closeTerminal('terminal-1');
  assert.equal(calls, 1);
  events['terminal-closed']({ payload: { sessionId: 'terminal-1' } });
  assert.equal(env.sessions.readTerminalPageState().terminals.length, 0);
  stop.resolve(); await first;
  cleanup();
});

test('dock drag and keyboard resizing respect bounds; hidden panel keeps its terminal workspace mounted', () => {
  const env = fixture();
  env.panel.openProjectTerminal({ id: 'script-1', cwd: '/project', title: 'dev' });
  const effects = [], assigned = [];
  let hookIndex = 0;
  const initial = [true, 600, null];
  const Dock = env.load('src/components/Terminal/ProjectTerminalDock.jsx', {
    react: {
      useRef: value => ({ current: value }),
      useState: () => { const index = hookIndex++; return [initial[index], value => assigned.push({ index, value })]; },
      useEffect: effect => effects.push(effect), useLayoutEffect: () => {},
    },
    'lucide-react': { ChevronUp: 'ChevronUp', Terminal: 'Terminal' },
    '@/hooks/useTerminalSessions': { useTerminalSessionState: env.sessions.readTerminalPageState },
    '@/store/useTerminalPanelStore': { ...env.panel, useTerminalPanelStore: () => env.panel.useTerminalPanelStore.getState() },
    './TerminalWorkspace': { __esModule: true, default: 'TerminalWorkspace' },
  }).default;
  const all = tree => Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : [];
  const nodes = all(Dock({ project: { path: '/project', name: '项目' } }));
  const separator = nodes.find(node => node.props.role === 'separator');
  const target = { focus() {}, setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
  separator.props.onPointerDown({ button: 0, pointerId: 1, clientY: 450, currentTarget: target, preventDefault() {} });
  separator.props.onPointerMove({ pointerId: 1, clientY: 350 });
  assert.equal(assigned.at(-1).value, 400);
  separator.props.onPointerUp({ pointerId: 1, clientY: 350, currentTarget: target });
  assert.equal(env.panel.useTerminalPanelStore.getState().height, 400);
  separator.props.onKeyDown({ key: 'End', preventDefault() {} });
  assert.equal(env.panel.useTerminalPanelStore.getState().height, 460);
  separator.props.onDoubleClick();
  assert.equal(env.panel.useTerminalPanelStore.getState().height, 300);
  env.panel.useTerminalPanelStore.getState().hide();
  hookIndex = 0;
  const hiddenNodes = all(Dock({ project: { path: '/project', name: '项目' } }));
  assert.equal(hiddenNodes.find(node => node.props.id === 'project-terminal-panel').props.hidden, true);
  assert.equal(hiddenNodes.find(node => node.type === 'TerminalWorkspace').props.visible, false);
});
