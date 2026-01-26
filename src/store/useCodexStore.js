import { create } from 'zustand';
import {
	startCodexSession,
	sendCodexMessage,
	approveCodexAction,
	stopCodexSession
} from '@/services/codex';

const listeners = new Map();
const MAX_EVENTS = 300;
const MAX_FILE_CHANGES = 50;

const buildEventItem = (kind, payload, timestamp) => {
	const resolvedTimestamp =
		timestamp || payload?.timestamp_ms || payload?.timestamp || Date.now();
	return {
		id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		kind,
		payload,
		timestamp: resolvedTimestamp
	};
};

const normalizeStatus = status => {
	if (!status) return 'idle';
	return String(status).toLowerCase().replace(/[_\\s]+/g, '');
};

export const useCodexStore = create((set, get) => ({
	sessions: [],
	activeSessionId: null,
	isStarting: false,
	isSending: false,
	startSession: async ({
		sessionId,
		title,
		workspace,
		cliPath,
		cliArgs
	}) => {
		const existing = get().sessions.find(session => session.id === sessionId);
		if (existing) {
			set({ activeSessionId: sessionId });
			return sessionId;
		}

		set(state => ({
			sessions: [
				...state.sessions,
				{
					id: sessionId,
					title,
					workspace,
					status: 'connecting',
					createdAt: Date.now(),
					lastUpdated: Date.now(),
					events: [],
					pendingActions: [],
					fileChanges: [],
					error: null
				}
			],
			activeSessionId: sessionId,
			isStarting: true
		}));

		try {
			const subscription = await startCodexSession({
				sessionId,
				workspace,
				cliPath,
				cliArgs,
				onEvent: event => get().appendEvent(sessionId, event),
				onStatus: status => get().updateStatus(sessionId, status),
				onFileChange: change => get().appendFileChange(sessionId, change)
			});

			listeners.set(sessionId, subscription);
			set({ isStarting: false });
			return subscription.sessionId;
		} catch (error) {
			set(state => ({
				sessions: state.sessions.map(session =>
					session.id === sessionId
						? {
								...session,
								status: 'error',
								error: error?.message || String(error),
								lastUpdated: Date.now()
							}
						: session
					),
				isStarting: false
			}));
			throw error;
		}
	},
	stopSession: async sessionId => {
		const subscription = listeners.get(sessionId);
		if (subscription) {
			await subscription.unlisten();
			listeners.delete(sessionId);
		}

		try {
			await stopCodexSession({ sessionId });
		} catch (error) {
			console.error('停止 Codex 会话失败:', error);
		}

		set(state => {
			const nextSessions = state.sessions.filter(
				session => session.id !== sessionId
			);
			const nextActive =
				state.activeSessionId === sessionId
					? nextSessions[0]?.id ?? null
					: state.activeSessionId;
			return {
				sessions: nextSessions,
				activeSessionId: nextActive
			};
		});
	},
	setActiveSession: sessionId => set({ activeSessionId: sessionId }),
	sendMessage: async ({ sessionId, content, files }) => {
		set({ isSending: true });
		try {
			const result = await sendCodexMessage({
				sessionId,
				content,
				files
			});
			set({ isSending: false });
			return result;
		} catch (error) {
			set({ isSending: false });
			throw error;
		}
	},
	approveAction: async ({ sessionId, callId, decision }) => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							pendingActions: session.pendingActions.filter(
								action => action.callId !== callId
							),
							lastUpdated: Date.now()
						}
					: session
				)
		}));

		return approveCodexAction({ sessionId, callId, decision });
	},
	appendEvent: (sessionId, eventPayload) => {
		const kind = eventPayload?.kind || eventPayload?.type || 'event';
		const payload = eventPayload?.payload ?? eventPayload;
		const entry = buildEventItem(kind, payload, eventPayload?.timestamp_ms);

		set(state => ({
			sessions: state.sessions.map(session => {
				if (session.id !== sessionId) return session;

				const nextEvents = [...session.events, entry].slice(-MAX_EVENTS);
				let nextPending = session.pendingActions;
				if (kind === 'permission-request') {
					const callId = payload?.callId ?? payload?.id;
					if (callId != null) {
						nextPending = [
							...session.pendingActions.filter(
								action => action.callId !== callId
							),
							{
								callId,
								method: payload?.method,
								params: payload?.params,
								action: payload?.action,
								createdAt: Date.now()
							}
						];
					}
				}

				return {
					...session,
					events: nextEvents,
					pendingActions: nextPending,
					lastUpdated: Date.now(),
					error: kind === 'parse-error' ? payload?.error : session.error
				};
			})
		}));
	},
	appendFileChange: (sessionId, payload) => {
		const entry = buildEventItem('file-change', payload, payload?.timestamp_ms);
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							fileChanges: [
								...session.fileChanges,
								entry
							].slice(-MAX_FILE_CHANGES),
							lastUpdated: Date.now()
						}
					: session
				)
		}));
	},
	updateStatus: (sessionId, statusPayload) => {
		const status = normalizeStatus(statusPayload?.status || statusPayload);
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							status,
							statusDetail: statusPayload?.detail ?? null,
							lastUpdated: Date.now()
						}
					: session
				)
		}));
	},
	resetCodex: async () => {
		for (const [sessionId, subscription] of listeners.entries()) {
			await subscription.unlisten();
			listeners.delete(sessionId);
			await stopCodexSession({ sessionId }).catch(() => null);
		}
		set({ sessions: [], activeSessionId: null, isStarting: false });
	}
}));

export default useCodexStore;
