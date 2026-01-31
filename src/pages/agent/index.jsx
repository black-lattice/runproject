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
		updateSessionWorkspace,
		savedModels
	} = useAgentStore();
	const { tabs, addTab } = useAppStore();

	const [workspacePath, setWorkspacePath] = useState('');
	const [workspaceError, setWorkspaceError] = useState('');
	const [messageInput, setMessageInput] = useState('');
	const [sendError, setSendError] = useState('');
	const [rememberApproval, setRememberApproval] = useState(false);

	const [files, setFiles] = useState([]);
	const [filesLoading, setFilesLoading] = useState(false);
	const [dirChildrenMap, setDirChildrenMap] = useState({});
	const [dirLoadingMap, setDirLoadingMap] = useState({});
	const [expandedDirs, setExpandedDirs] = useState(() => new Set());

	// Group models dynamically
	const dynamicModelGroups = useMemo(() => {
		const groups = [
			{
				label: 'CLI',
				models: [{ value: 'codex-cli', label: 'codex (CLI)' }]
			}
		];

		// Filter saved models that have an API key
		const configuredModels = savedModels.filter(m => m.api_key && m.model !== 'codex-cli');
		
		if (configuredModels.length > 0) {
			const openaiModels = configuredModels.filter(m => m.provider === 'openai');
			const deepseekModels = configuredModels.filter(m => m.provider === 'deepseek');

			if (openaiModels.length > 0) {
				groups.push({
					label: 'OpenAI',
					models: openaiModels.map(m => ({ value: m.id, label: m.model }))
				});
			}
			if (deepseekModels.length > 0) {
				groups.push({
					label: 'DeepSeek',
					models: deepseekModels.map(m => ({ value: m.id, label: m.model }))
				});
			}
		}

		return groups;
	}, [savedModels]);

	// Mention & IME states
	const [showMentions, setShowMentions] = useState(false);
	const [mentionQuery, setMentionQuery] = useState('');
	const [mentionCursorIndex, setMentionCursorIndex] = useState(-1);
	const [mentionNavIndex, setMentionNavIndex] = useState(0);
	const isComposing = useRef(false);
	const textareaRef = useRef(null);
	const hasAutoCreated = useRef(false);

	useEffect(() => {
		loadSettings().catch(() => null);
	}, [loadSettings]);

	const activeSession = sessions.find(
		session => session.id === activeSessionId
	);

	useEffect(() => {
		if (activeSession) {
			setWorkspacePath(activeSession.workspace || '');
			setWorkspaceError('');
		}
	}, [activeSessionId, activeSession?.workspace]);

	useEffect(() => {
		setDirChildrenMap({});
		setDirLoadingMap({});
		setExpandedDirs(new Set());
	}, [workspacePath]);

	// Auto-create initial session ONLY on mount and ONLY after settings are loaded
	useEffect(() => {
		const hasEmpty = sessions.some(s => s.title === '新会话' && !s.workspace);
		if (sessions.length === 0 && settings && !hasAutoCreated.current && !hasEmpty) {
			hasAutoCreated.current = true;
			const nextSessionId = buildSessionId();
			startSession({
				sessionId: nextSessionId,
				title: '新会话',
				workspace: ''
			});
		}
	}, [settings, sessions.length, startSession]);

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

	const loadDirChildren = useCallback(
		async dirPath => {
			if (dirChildrenMap[dirPath] || dirLoadingMap[dirPath]) {
				return;
			}
			setDirLoadingMap(prev => ({ ...prev, [dirPath]: true }));
			try {
				const entries = await invoke('read_dir', { path: dirPath });
				setDirChildrenMap(prev => ({ ...prev, [dirPath]: entries }));
			} catch (error) {
				console.error('Failed to read dir:', error);
				setDirChildrenMap(prev => ({ ...prev, [dirPath]: [] }));
			} finally {
				setDirLoadingMap(prev => ({ ...prev, [dirPath]: false }));
			}
		},
		[dirChildrenMap, dirLoadingMap]
	);

	const handleToggleDir = useCallback(
		async dirPath => {
			const isExpanded = expandedDirs.has(dirPath);

			setExpandedDirs(prev => {
				const next = new Set(prev);
				if (prev.has(dirPath)) {
					next.delete(dirPath);
				} else {
					next.add(dirPath);
				}
				return next;
			});

			if (!isExpanded) {
				await loadDirChildren(dirPath);
			}
		},
		[loadDirChildren, expandedDirs]
	);

	const handleDragStart = useCallback((event, entry) => {
		const payload = JSON.stringify({
			name: entry.name,
			path: entry.path,
			isDir: entry.isDir
		});
		event.dataTransfer.setData('application/json', payload);
		event.dataTransfer.setData('text/plain', payload);
		event.dataTransfer.effectAllowed = 'copy';
	}, []);

	const pendingAction = activeSession?.pendingActions?.[0] || null;

	const knownFiles = useMemo(() => {
		const map = new Map();
		files.forEach(f => {
			map.set(f.path, f);
		});
		Object.values(dirChildrenMap).forEach(list => {
			(list || []).forEach(f => {
				map.set(f.path, f);
			});
		});
		return Array.from(map.values());
	}, [files, dirChildrenMap]);

	// Filtered files for mention dropdown
	const filteredFiles = useMemo(() => {
		if (!mentionQuery) return knownFiles;
		return knownFiles.filter(f =>
			f.name.toLowerCase().includes(mentionQuery.toLowerCase())
		);
	}, [knownFiles, mentionQuery]);

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
			const mentionedNames = new Set(
				(messageInput.match(/@([\\w\\u4e00-\\u9fa5\\.\\-\\/]+)/g) || []).map(
					item => item.slice(1)
				)
			);
			const filesToSend = knownFiles
				.filter(f => mentionedNames.has(f.name))
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
		// Check if there's already an empty session (title is '新会话' and workspace is empty)
		const existingEmptySession = sessions.find(
			s => s.title === '新会话' && !s.workspace
		);

		if (existingEmptySession) {
			setActiveSession(existingEmptySession.id);
			setWorkspacePath('');
			setWorkspaceError('');
			return;
		}

		setWorkspacePath('');
		setWorkspaceError('');

		const nextSessionId = buildSessionId();
		await startSession({
			sessionId: nextSessionId,
			title: '新会话',
			workspace: ''
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
			if (value === 'codex-cli') {
				await saveSettings({
					...settings,
					model: 'codex-cli',
					provider: 'codex'
				});
				return;
			}

			// Find config from saved models
			const modelConfig = savedModels.find(m => m.id === value);
			if (modelConfig) {
				await saveSettings({
					provider: modelConfig.provider,
					model: modelConfig.model,
					api_key: modelConfig.api_key,
					base_url: modelConfig.base_url || null
				});
			}
		} catch (error) {
			console.error('Failed to update model:', error);
		}
	};

	// Determine currently selected value for UI
	const currentModelValue = useMemo(() => {
		if (settings?.model === 'codex-cli') return 'codex-cli';
		// Find ID of saved model that matches current active settings
		const matched = savedModels.find(m => 
			m.model === settings?.model && 
			m.api_key === settings?.api_key && 
			(m.base_url || '') === (settings?.base_url || '')
		);
		return matched?.id || settings?.model || 'codex-cli';
	}, [settings, savedModels]);

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

	const insertMentionAtCursor = useCallback(name => {
		const input = textareaRef.current;
		setMessageInput(prev => {
			const start = input?.selectionStart ?? prev.length;
			const end = input?.selectionEnd ?? prev.length;
			const before = prev.slice(0, start);
			const after = prev.slice(end);
			const insertText = `@${name}`;
			const spaceBefore = before && !before.endsWith(' ') ? ' ' : '';
			const spaceAfter = after && !after.startsWith(' ') ? ' ' : ' ';
			const next = `${before}${spaceBefore}${insertText}${spaceAfter}${after}`;

			requestAnimationFrame(() => {
				if (!input) return;
				const cursor = (before + spaceBefore + insertText + ' ').length;
				input.focus();
				input.setSelectionRange(cursor, cursor);
			});

			return next;
		});
	}, []);

	const handleDropEntry = useCallback(
		entry => {
			if (!entry?.name) return;
			insertMentionAtCursor(entry.name);
		},
		[insertMentionAtCursor]
	);

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
						settings={settings}
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
						modelGroups={dynamicModelGroups}
						currentModelValue={currentModelValue}
						showMentions={showMentions}
						filteredFiles={filteredFiles}
						mentionNavIndex={mentionNavIndex}
						onSelectFile={handleSelectFile}
						textareaRef={textareaRef}
						onPickWorkspace={handlePickWorkspace}
						onCompositionStart={() => (isComposing.current = true)}
						onCompositionEnd={() => (isComposing.current = false)}
						pendingAction={pendingAction}
						onApprove={handleApprove}
						onDropEntry={handleDropEntry}
					/>
				</section>

				<FileSidebar
					files={files}
					filesLoading={filesLoading}
					workspacePath={workspacePath}
					onRefresh={fetchFiles}
					expandedDirs={expandedDirs}
					dirChildrenMap={dirChildrenMap}
					dirLoadingMap={dirLoadingMap}
					onToggleDir={handleToggleDir}
					onDragStartEntry={handleDragStart}
				/>
			</div>
		</div>
	);
}

export default AgentPage;
