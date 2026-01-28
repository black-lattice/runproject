import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const getAgentSettings = async () => {
	return invoke('agent_get_settings');
};

export const saveAgentSettings = async settings => {
	return invoke('agent_save_settings', { settings });
};

export const getMcpConfig = async () => {
	return invoke('agent_get_mcp_config');
};

export const saveMcpConfig = async config => {
	return invoke('agent_save_mcp_config', { config });
};

export const startAgentSession = async ({ sessionId, workspace, onEvent }) => {
	const unlisten = await listen(`agent-event-${sessionId}`, event => {
		onEvent?.(event.payload);
	});

	try {
		const result = await invoke('agent_start_session', {
			sessionId,
			workspace
		});

		return {
			sessionId: result,
			unlisten: async () => {
				await unlisten();
			}
		};
	} catch (error) {
		await unlisten();
		throw error;
	}
};

export const sendAgentMessage = async ({ sessionId, content }) => {
	return invoke('agent_send_message', { sessionId, content });
};

export const approveAgentAction = async ({ sessionId, callId, decision, remember }) => {
	return invoke('agent_approve_action', {
		sessionId,
		callId,
		decision,
		remember
	});
};

export const stopAgentSession = async ({ sessionId }) => {
	return invoke('agent_stop_session', { sessionId });
};
