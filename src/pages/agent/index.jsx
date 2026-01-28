import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Bot } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { useAppStore } from '@/store/useAppStore';

import { SessionSidebar } from './coms/SessionSidebar';
import { FileSidebar } from './coms/FileSidebar';
import { ChatArea } from './coms/ChatArea';
import { InputArea } from './coms/InputArea';

const buildSessionId = () => `agent-${Date.now()}`;

const modelGroups = [
	{
		label: 'OpenAI',
		models: [
			{ value: 'gpt-4.1', label: 'gpt-4.1' },
			{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
			{ value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' }
		]
	},
	{
		label: 'DeepSeek',
		models: [
			{ value: 'deepseek-chat', label: 'deepseek-chat' },
			{ value: 'deepseek-reasoner', label: 'deepseek-reasoner' }
		]
	},
	{
		label: 'CLI',
		models: [{ value: 'codex-cli', label: 'codex (CLI)' }]
	}
];

const inferProvider = model => {
	if (!model) return 'openai';
	if (model === 'codex-cli') return 'codex';
	return model.toLowerCase().startsWith('deepseek-') ? 'deepseek' : 'openai';
};
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

function AgentPage() {
	const {
		settings,
		loadSettings,
		saveSettings,
		sessions,
		activeSessionId,
		isSending,
		startSession,
		setActiveSession,
		sendMessage,
		appendMessage,
		approveAction,
		updateSessionWorkspace
	} = useAgentStore();
	const { tabs, addTab } = useAppStore();

	const [workspacePath, setWorkspacePath] = useState('');
	const [workspaceError, setWorkspaceError] = useState('');
	const [messageInput, setMessageInput] = useState('');
	const [sendError, setSendError] = useState('');
	const [rememberApproval, setRememberApproval] = useState(false);

	const [files, setFiles] = useState([]);
	const [filesLoading, setFilesLoading] = useState(false);

	// Mention & IME states
	const [showMentions, setShowMentions] = useState(false);
	const [mentionQuery, setMentionQuery] = useState('');
	const [mentionCursorIndex, setMentionCursorIndex] = useState(-1);
	const [mentionNavIndex, setMentionNavIndex] = useState(0);
	const isComposing = useRef(false);
	const textareaRef = useRef(null);

	useEffect(() => {
		if (!tabs.includes('agent')) {
			addTab('agent');
		}
	}, [tabs, addTab]);

	useEffect(() => {
		loadSettings().catch(() => null);
	}, [loadSettings]);

	const activeSession = sessions.find(
		session => session.id === activeSessionId
	);

	useEffect(() => {
		if (activeSession?.workspace) {
			setWorkspacePath(activeSession.workspace);
			setWorkspaceError('');
		}
	}, [activeSessionId]);

	const fetchFiles = useCallback(async () => {
		if (!workspacePath) {
			setFiles([]);
			return;
		}
		setFilesLoading(true);
		try {
			const entries = await invoke('read_dir', { path: workspacePath });
			setFiles(entries);
		} catch (error) {
			console.error('Failed to read dir:', error);
			setFiles([]);
		} finally {
			setFilesLoading(false);
		}
	}, [workspacePath]);

	useEffect(() => {
		fetchFiles();
	}, [fetchFiles]);

	const pendingAction = activeSession?.pendingActions?.[0] || null;

	// Filtered files for mention dropdown
	const filteredFiles = useMemo(() => {
		if (!mentionQuery) return files;
		return files.filter(f =>
			f.name.toLowerCase().includes(mentionQuery.toLowerCase())
		);
	}, [files, mentionQuery]);

	const handlePickWorkspace = async () => {
		const directory = await open({
			directory: true,
			multiple: false,
			title: '选择 Agent 工作目录'
		});

		if (directory) {
			const newPath = String(directory);
			setWorkspacePath(newPath);
			setWorkspaceError('');
			setSendError('');

			if (activeSession) {
				updateSessionWorkspace(activeSession.id, newPath);
			}
		}
	};

	const ensureSession = async () => {
		let sessionId = activeSession?.id;
		if (sessionId) return sessionId;

		const nextSessionId = buildSessionId();
		const folderName =
			workspacePath.trim().split('/').filter(Boolean).pop() || '工作区';
		await startSession({
			sessionId: nextSessionId,
			title: folderName,
			workspace: workspacePath.trim()
		});
		return nextSessionId;
	};

	const handleSend = async () => {
		if (!workspacePath.trim()) {
			setWorkspaceError('请先选择工作目录');
			return;
		}
		if (!messageInput.trim()) return;

		setSendError('');
		setShowMentions(false);
		try {
			const sessionId = await ensureSession();
			if (settings?.provider === 'codex' && !activeSession?.ready) {
				setSendError('Codex 正在加载 MCP，请稍候再发送');
				return;
			}

			// Scan messageInput for mentioned files
			// Simple logic: check if '@filename' is present in the text
			const filesToSend = files
				.filter(f => messageInput.includes(`@${f.name}`))
				.map(f => f.path);

			appendMessage(sessionId, 'user', messageInput.trim());
			await sendMessage({
				sessionId,
				content: messageInput.trim(),
				files: filesToSend.length > 0 ? filesToSend : undefined
			});
			setMessageInput('');
		} catch (error) {
			setSendError(error?.message || String(error));
		}
	};

	const handleNewSession = async () => {
		if (!workspacePath.trim()) {
			setWorkspaceError('请先选择工作目录');
			return;
		}
		const nextSessionId = buildSessionId();
		const folderName =
			workspacePath.trim().split('/').filter(Boolean).pop() || '工作区';
		await startSession({
			sessionId: nextSessionId,
			title: folderName,
			workspace: workspacePath.trim()
		});
	};

	const handleApprove = async decision => {
		if (!pendingAction) return;
		await approveAction({
			sessionId: activeSessionId,
			callId: pendingAction.callId,
			decision,
			remember: rememberApproval
		});
		setRememberApproval(false);
	};

	const messages = useMemo(
		() => activeSession?.messages || [],
		[activeSession]
	);

	const handleModelChange = async value => {
		try {
			const newProvider = inferProvider(value);
			const baseUrl =
				newProvider === 'deepseek' ? DEFAULT_DEEPSEEK_BASE_URL : '';
			await saveSettings({
				...settings,
				model: value,
				provider: newProvider,
				base_url: baseUrl || settings?.base_url || null
			});
		} catch (error) {
			console.error('Failed to update model:', error);
		}
	};

	const handleSelectFile = file => {
		const beforeMention = messageInput.slice(0, mentionCursorIndex);
		const afterMention = messageInput.slice(
			mentionCursorIndex + mentionQuery.length + 1
		);

		// Insert the file name with @ prefix, and a space after
		const newText = `${beforeMention}@${file.name} ${afterMention}`;
		setMessageInput(newText);

		setShowMentions(false);
		setMentionQuery('');
		textareaRef.current?.focus();
	};

	const handleKeyDown = e => {
		if (isComposing.current && e.key === 'Enter') {
			return;
		}

		if (showMentions) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setMentionNavIndex(prev =>
					Math.min(prev + 1, filteredFiles.length - 1)
				);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setMentionNavIndex(prev => Math.max(prev - 1, 0));
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				if (filteredFiles[mentionNavIndex]) {
					handleSelectFile(filteredFiles[mentionNavIndex]);
				}
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				setShowMentions(false);
				return;
			}
		}

		if (e.key === 'Enter') {
			if (e.metaKey || e.ctrlKey) {
				e.preventDefault();
				setMessageInput(prev => prev + '\n');
			} else if (!e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		}
	};

	const handleInputChange = e => {
		const newValue = e.target.value;
		const selectionStart = e.target.selectionStart;
		setMessageInput(newValue);

		const textBeforeCursor = newValue.slice(0, selectionStart);
		const lastAt = textBeforeCursor.lastIndexOf('@');

		if (lastAt !== -1) {
			const query = textBeforeCursor.slice(lastAt + 1);
			// Only trigger mention if no spaces yet, or improve regex for better robustness
			if (!/\s/.test(query)) {
				setMentionCursorIndex(lastAt);
				setMentionQuery(query);
				setShowMentions(true);
				setMentionNavIndex(0);
				return;
			}
		}
		setShowMentions(false);
	};

	return (
		<div className='h-full flex flex-col bg-gray-50'>
			<div className='flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_240px] min-h-0'>
				<SessionSidebar onNewSession={handleNewSession} />

				<section className='flex flex-col min-h-0 border-r border-gray-200'>
					<div className='border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between'>
						<div className='flex items-center gap-3'>
							<div className='h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center'>
								<Bot className='h-5 w-5 text-emerald-600' />
							</div>
							<div>
								<div className='text-sm font-semibold text-gray-800'>
									{activeSession?.title || '未选择会话'}
								</div>
								<p className='text-xs text-gray-500'>
									{activeSession?.workspace || '请选择或创建 Agent 会话'}
								</p>
								{sendError && (
									<p className='text-xs text-red-500 mt-1'>{sendError}</p>
								)}
								{activeSession?.error && (
									<p className='text-xs text-red-500 mt-1'>
										{activeSession.error}
									</p>
								)}
							</div>
						</div>
					</div>

					<ChatArea
						activeSession={activeSession}
						messages={messages}
						isSending={isSending}
						pendingAction={pendingAction}
						onApprove={handleApprove}
						rememberApproval={rememberApproval}
						setRememberApproval={setRememberApproval}
					/>

					<InputArea
						workspacePath={workspacePath}
						workspaceError={workspaceError}
						messageInput={messageInput}
						onMessageChange={handleInputChange}
						onKeyDown={handleKeyDown}
						sendError={sendError}
						isSending={isSending}
						activeSession={activeSession}
						messages={messages}
						settings={settings}
						onModelChange={handleModelChange}
						modelGroups={modelGroups}
						showMentions={showMentions}
						filteredFiles={filteredFiles}
					
mentionNavIndex={mentionNavIndex}
						onSelectFile={handleSelectFile}
						textareaRef={textareaRef}
						onPickWorkspace={handlePickWorkspace}
						onCompositionStart={() => (isComposing.current = true)}
						onCompositionEnd={() => (isComposing.current = false)}
					/>
				</section>

				<FileSidebar
					files={files}
					filesLoading={filesLoading}
					workspacePath={workspacePath}
					onRefresh={fetchFiles}
				/>
			</div>
		</div>
	);
}

export default AgentPage;
