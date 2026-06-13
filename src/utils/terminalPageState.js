export const TERMINAL_PAGE_STORAGE_KEY = 'terminal_page_state';

export const readTerminalPageState = () => {
	if (typeof window === 'undefined') {
		return { terminals: [], activeTerminalId: null };
	}

	try {
		const stored = window.localStorage.getItem(TERMINAL_PAGE_STORAGE_KEY);
		if (!stored) return { terminals: [], activeTerminalId: null };

		const parsed = JSON.parse(stored);
		return {
			terminals: Array.isArray(parsed.terminals) ? parsed.terminals : [],
			activeTerminalId: parsed.activeTerminalId || null
		};
	} catch (error) {
		console.error('读取终端页状态失败:', error);
		return { terminals: [], activeTerminalId: null };
	}
};

export const upsertTerminalPageSession = terminal => {
	if (typeof window === 'undefined' || !terminal?.id) return;

	const current = readTerminalPageState();
	const nextTerminal = {
		...terminal,
		existingSession: true
	};
	const exists = current.terminals.some(item => item.id === nextTerminal.id);
	const terminals = exists
		? current.terminals.map(item =>
				item.id === nextTerminal.id ? { ...item, ...nextTerminal } : item
			)
		: [...current.terminals, nextTerminal];

	try {
		window.localStorage.setItem(
			TERMINAL_PAGE_STORAGE_KEY,
			JSON.stringify({
				terminals,
				activeTerminalId: nextTerminal.id
			})
		);
	} catch (error) {
		console.error('保存终端页状态失败:', error);
	}
};
