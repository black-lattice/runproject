export const TERMINAL_PAGE_STORAGE_KEY = 'terminal_page_state';

let snapshot;
const subscribers = new Set();

export const readTerminalPageState = () => {
	if (snapshot) return snapshot;
	let stored;
	try {
		stored = JSON.parse(window.localStorage.getItem(TERMINAL_PAGE_STORAGE_KEY) || 'null');
	} catch (error) {
		console.warn('读取终端状态失败:', error);
	}
	const terminals = (Array.isArray(stored?.terminals) ? stored.terminals : [])
		.filter((item, index, items) => item?.id && item.cwd && items.findIndex(other => other?.id === item.id) === index)
		.map((item, index) => ({ ...item, existingSession: true, title: item.title || `Terminal ${index + 1}` }));
	snapshot = {
		terminals,
		activeTerminalId: terminals.some(item => item.id === stored?.activeTerminalId)
			? stored.activeTerminalId : terminals[0]?.id ?? null,
	};
	return snapshot;
};

export const subscribeTerminalPageState = listener => {
	subscribers.add(listener);
	return () => subscribers.delete(listener);
};

const saveTerminalPageState = next => {
	snapshot = next;
	try {
		if (next.terminals.length) {
			window.localStorage.setItem(TERMINAL_PAGE_STORAGE_KEY, JSON.stringify(next));
		} else {
			window.localStorage.removeItem(TERMINAL_PAGE_STORAGE_KEY);
		}
	} catch (error) {
		console.error('保存终端状态失败:', error);
	}
	subscribers.forEach(listener => listener());
};

export const upsertTerminalPageSession = terminal => {
	if (!terminal?.id || !terminal.cwd) return;
	const current = readTerminalPageState();
	const nextTerminal = { ...terminal, existingSession: true };
	const exists = current.terminals.some(item => item.id === terminal.id);
	saveTerminalPageState({
		terminals: exists
			? current.terminals.map(item => item.id === terminal.id ? { ...item, ...nextTerminal } : item)
			: [...current.terminals, nextTerminal],
		activeTerminalId: terminal.id,
	});
};

export const selectTerminalPageSession = id => {
	const current = readTerminalPageState();
	if (current.activeTerminalId === id || !current.terminals.some(item => item.id === id)) return;
	saveTerminalPageState({ ...current, activeTerminalId: id });
};

export const removeTerminalPageSession = id => {
	const current = readTerminalPageState();
	const index = current.terminals.findIndex(item => item.id === id);
	if (index === -1) return;
	const terminals = current.terminals.filter(item => item.id !== id);
	saveTerminalPageState({
		terminals,
		activeTerminalId: current.activeTerminalId === id
			? terminals[Math.max(0, index - 1)]?.id ?? null : current.activeTerminalId,
	});
};
