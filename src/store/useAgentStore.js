import { create } from 'zustand';
import {
	getAgentSettings,
	saveAgentSettings,
	startAgentSession,
	sendAgentMessage,
	approveAgentAction,
	stopAgentSession
} from '@/services/agent';
import {
	startCodexSession,
	sendCodexMessage,
	approveCodexAction,
	stopCodexSession
} from '@/services/codex';

const listeners = new Map();
const MAX_MESSAGES = 500;

const buildMessage = (role, content, reasoning = '') => ({
	id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	role,
	content,
	reasoning,
	createdAt: Date.now()
});

export const useAgentStore = create((set, get) => ({
	settings: null,
	settingsStatus: 'idle',
	settingsError: null,
	sessions: [],
	activeSessionId: null,
	isStarting: false,
	isSending: false,
	loadSettings: async () => {
		set({ settingsStatus: 'loading', settingsError: null });
		try {
			const settings = await getAgentSettings();
			set({ settings, settingsStatus: 'ready' });
			return settings;
		} catch (error) {
			set({ settingsStatus: 'error', settingsError: error?.message || String(error) });
			throw error;
		}
	},
	saveSettings: async nextSettings => {
		set({ settingsStatus: 'saving', settingsError: null });
		try {
			await saveAgentSettings(nextSettings);
			set({ settings: nextSettings, settingsStatus: 'ready' });
		} catch (error) {
			set({ settingsStatus: 'error', settingsError: error?.message || String(error) });
			throw error;
		}
	},
	startSession: async ({ sessionId, title, workspace }) => {
		const provider = get().settings?.provider || 'openai';
		const isCodexProvider = provider === 'codex';
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
					provider,
					status: 'starting',
					ready: provider !== 'codex',
					messages: [],
					pendingActions: [],
					streamingMessageId: null,
					lastUpdated: Date.now(),
					error: null
				}
			],
			activeSessionId: sessionId,
			isStarting: true
		}));

		try {
			const subscription = isCodexProvider
				? await startCodexSession({
						sessionId,
						workspace,
						onEvent: event => get().handleCodexEvent(sessionId, event),
						onStatus: status => get().updateStatus(sessionId, status),
						onFileChange: change => get().handleCodexEvent(sessionId, change)
					})
				: await startAgentSession({
						sessionId,
						workspace,
						onEvent: event => get().handleEvent(sessionId, event)
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
		const session = get().sessions.find(item => item.id === sessionId);
		if (session?.provider === 'codex') {
			await stopCodexSession({ sessionId }).catch(() => null);
		} else {
			await stopAgentSession({ sessionId }).catch(() => null);
		}
		set(state => {
			const nextSessions = state.sessions.filter(session => session.id !== sessionId);
			const nextActive = state.activeSessionId === sessionId ? nextSessions[0]?.id ?? null : state.activeSessionId;
			return { sessions: nextSessions, activeSessionId: nextActive };
		});
	},
	updateSessionWorkspace: (sessionId, newWorkspace) => {
		const folderName = newWorkspace.trim().split('/').filter(Boolean).pop() || '工作区';
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							workspace: newWorkspace,
							title: folderName,
							lastUpdated: Date.now()
						}
					: session
			)
		}));
	},
	setActiveSession: sessionId => set({ activeSessionId: sessionId }),
	sendMessage: async ({ sessionId, content }) => {
		set({ isSending: true });
		try {
			const session = get().sessions.find(item => item.id === sessionId);
			if (session?.provider === 'codex') {
				if (!session.ready) {
					throw new Error('Codex 正在加载 MCP，请稍候再发送');
				}
				const settingsModel = get().settings?.model;
				const model = settingsModel === 'codex-cli' ? undefined : settingsModel;
				
				await sendCodexMessage({ sessionId, content, model });
				// Codex is async/streaming, so we keep isSending = true until we get a response/done event
			} else {
				await sendAgentMessage({ sessionId, content });
				set({ isSending: false });
			}
		} catch (error) {
			set({ isSending: false });
			throw error;
		}
	},
	approveAction: async ({ sessionId, callId, decision, remember }) => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							pendingActions: session.pendingActions.filter(action => action.callId !== callId),
							lastUpdated: Date.now()
						}
					: session
			)
		}));
		const session = get().sessions.find(item => item.id === sessionId);
		if (session?.provider === 'codex') {
			return approveCodexAction({ sessionId, callId, decision });
		}
		return approveAgentAction({ sessionId, callId, decision, remember });
	},
	handleCodexEvent: (sessionId, eventPayload) => {
		const kind = eventPayload?.kind || eventPayload?.type || 'event';
		const payload = eventPayload?.payload ?? eventPayload;

		switch (kind) {
			case 'mcp-tools':
				get().updateStatus(sessionId, 'ready');
				get().setReady(sessionId, true);
				break;
			case 'permission-request':
				const params = payload.params;
				let requestText = params?.message || '需要执行敏感操作，请确认：';
				
				const cmd = params?.codex_command || params?.command;
				if (cmd) {
					const cmdStr = Array.isArray(cmd) ? cmd.join(' ') : cmd;
					requestText += '\n\n```bash\n' + cmdStr + '\n```';
				} else if (params?.patch) {
					requestText += '\n\n```diff\n' + params.patch + '\n```';
				}
				
				get().appendMessage(sessionId, 'assistant', requestText);
				get().appendPendingAction(sessionId, payload);
				break;
			case 'command-executed':
				const { command, stdout, stderr, exitCode } = payload;
				let outputMsg = `> ${command}\n`;
				if (stdout) outputMsg += `${stdout}\n`;
				if (stderr) outputMsg += `Error: ${stderr}\n`;
				outputMsg += `(Exit Code: ${exitCode})`;
				
				get().appendMessage(sessionId, 'system', outputMsg);
				break;
			case 'stdout':
				// Codex MCP 的 stdout 是 JSON-RPC 数据流，避免直接渲染导致卡顿
				break;
			case 'stderr':
				let stderrText = payload?.text || '';
				// 去除 ANSI 转义序列
				stderrText = stderrText.replace(/\x1B\[[0-9;]*[mK]/g, '');
				
				if (stderrText.trim()) {
					// 将所有后台输出都作为系统消息显示，UI 层会将其渲染为低调的状态提示
					get().appendMessage(sessionId, 'system', stderrText.trim());
				}
				break;
			case 'mcp-error':
				get().setError(sessionId, payload?.error || 'MCP 错误');
				set({ isSending: false });
				break;
			case 'notification':
				if (payload?.method === 'codex/event') {
					const msg = payload.params?.msg;
					if (msg?.type === 'raw_response_item') {
						const item = msg.item;
						if (item?.type === 'message' && item?.role === 'assistant') {
							const contentItem = item.content?.[0];
							const type = contentItem?.type;
							const text = contentItem?.text;
							
							if (text) {
								if (type === 'thought' || type === 'reasoning') {
									get().appendDelta(sessionId, text, true);
								} else {
									get().appendDelta(sessionId, text, false);
								}
							}
						}
					} else if (msg?.type === 'task_complete') {
						get().finalizeStream(sessionId);
						set({ isSending: false });
					} else if (msg?.type === 'stream_error') {
						const errorMsg = `Codex 连接中断: ${msg.message || '未知错误'}\n${msg.additional_details || ''}`;
						get().appendMessage(sessionId, 'system', errorMsg);
					}
				}
				break;
			case 'response':
				const content = payload?.result?.content;
				if (Array.isArray(content)) {
					const text = content
						.filter(c => c.type === 'text')
						.map(c => c.text)
						.join('');
					if (text) {
						// 检查最后一条消息是否已经包含了这段文本（避免重复流式输出和最终输出）
						const session = get().sessions.find(s => s.id === sessionId);
						const lastMsg = session?.messages[session.messages.length - 1];
						const streamingId = session?.streamingMessageId;
						
						// 如果正在流式传输且ID匹配，或者最后一条消息是assistant且内容不完全匹配
						if (!streamingId) {
							if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== text) {
								get().appendDelta(sessionId, text);
							}
						}
                        get().finalizeStream(sessionId);
					}
				}
				set({ isSending: false });
				break;
			case 'parse-error':
				get().setError(sessionId, payload?.error || '解析失败');
				set({ isSending: false });
				break;
			default:
				break;
		}
	},
	handleEvent: (sessionId, eventPayload) => {
		const kind = eventPayload?.kind || eventPayload?.type || 'event';
		const payload = eventPayload?.payload ?? eventPayload;

		switch (kind) {
			case 'session-start':
				get().updateStatus(sessionId, 'active');
				break;
			case 'session-stop':
				get().updateStatus(sessionId, 'stopped');
				break;
			case 'permission-request':
				get().appendPendingAction(sessionId, payload);
				break;
			case 'delta':
				get().appendDelta(sessionId, payload?.text || '');
				break;
			case 'refusal':
				get().appendMessage(
					sessionId,
					'system',
					`模型拒绝: ${payload?.text || '未知原因'}`
				);
				break;
			case 'done':
				get().finalizeStream(sessionId);
				break;
			case 'error':
				get().setError(sessionId, payload?.error || '未知错误');
				break;
			default:
				break;
		}
	},
	appendPendingAction: (sessionId, payload) => {
		if (payload?.callId === undefined || payload?.callId === null) return;
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							pendingActions: [
								...session.pendingActions.filter(action => action.callId !== payload.callId),
								{
									callId: payload.callId,
									actionType: payload.actionType,
									params: payload.params
								}
							],
							lastUpdated: Date.now()
						}
					: session
				)
		}));
	},
	appendDelta: (sessionId, delta, isReasoning = false) => {
		if (!delta) return;
		set(state => ({
			sessions: state.sessions.map(session => {
				if (session.id !== sessionId) return session;

				let messages = session.messages;
				let streamingId = session.streamingMessageId;
				if (!streamingId) {
					const streamingMessage = isReasoning 
						? buildMessage('assistant', '', delta)
						: buildMessage('assistant', delta, '');
					streamingId = streamingMessage.id;
					messages = [...messages, streamingMessage];
				} else {
					messages = messages.map(message =>
						message.id === streamingId
							? isReasoning 
								? { ...message, reasoning: (message.reasoning || '') + delta }
								: { ...message, content: (message.content || '') + delta }
							: message
					);
				}

				return {
					...session,
					messages: messages.slice(-MAX_MESSAGES),
					streamingMessageId: streamingId,
					lastUpdated: Date.now()
				};
			})
		}));
	},
	finalizeStream: sessionId => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							streamingMessageId: null,
							lastUpdated: Date.now()
						}
					: session
				)
		}));
	},
	appendMessage: (sessionId, role, content) => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							messages: [...session.messages, buildMessage(role, content)].slice(-MAX_MESSAGES),
							lastUpdated: Date.now()
						}
					: session
				)
		}));
	},
	setError: (sessionId, error) => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? { ...session, error, status: 'error', lastUpdated: Date.now() }
					: session
			)
		}));
	},
	updateStatus: (sessionId, status) => {
		const normalized =
			typeof status === 'string'
				? status
				: status?.status
					? String(status.status).toLowerCase()
					: 'unknown';
		
		const error = typeof status === 'object' ? (status?.error || status?.payload?.error || null) : null;

		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? {
							...session,
							status: normalized,
							error: error || session.error,
							ready:
								session.provider === 'codex' && (normalized === 'sessionactive' || normalized === 'ready')
									? true
									: session.ready,
							lastUpdated: Date.now()
						}
					: session
			)
		}));
	},
	setReady: (sessionId, ready) => {
		set(state => ({
			sessions: state.sessions.map(session =>
				session.id === sessionId
					? { ...session, ready, lastUpdated: Date.now() }
					: session
			)
		}));
	},
	resetAgent: async () => {
		for (const [sessionId, subscription] of listeners.entries()) {
			await subscription.unlisten();
			listeners.delete(sessionId);
			await stopAgentSession({ sessionId }).catch(() => null);
		}
		set({
			sessions: [],
			activeSessionId: null,
			isStarting: false,
			isSending: false
		});
	}
}));

export default useAgentStore;
