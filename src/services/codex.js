import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const startCodexSession = async ({
	sessionId,
	workspace,
	cliPath,
	cliArgs,
	onEvent,
	onStatus,
	onFileChange
}) => {
	const unlistenEvent = await listen(`codex-event-${sessionId}`, event => {
		onEvent?.(event.payload);
	});

	const unlistenStatus = await listen(`codex-status-${sessionId}`, event => {
		onStatus?.(event.payload);
	});

	const unlistenFile = await listen(`codex-file-change-${sessionId}`, event => {
		onFileChange?.(event.payload);
	});

	try {
		const result = await invoke('codex_start_session', {
			sessionId,
			workspace,
			cliPath,
			cliArgs
		});

		return {
			sessionId: result,
			unlisten: async () => {
				await unlistenEvent();
				await unlistenStatus();
				await unlistenFile();
			}
		};
	} catch (error) {
		await unlistenEvent();
		await unlistenStatus();
		await unlistenFile();
		throw error;
	}
};

export const sendCodexMessage = async ({ sessionId, content, files }) => {
	return invoke('codex_send_message', { sessionId, content, files });
};

export const approveCodexAction = async ({ sessionId, callId, decision }) => {
	return invoke('codex_approve_action', { sessionId, callId, decision });
};

export const stopCodexSession = async ({ sessionId }) => {
	return invoke('codex_stop_session', { sessionId });
};
