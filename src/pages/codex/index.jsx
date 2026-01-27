import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
	Bot,
	FolderOpen,
	Send,
	StopCircle,
	ShieldCheck,
	FileDiff,
	Activity,
	AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCodexStore } from '@/store/useCodexStore';
import { useAppStore } from '@/store/useAppStore';

const buildSessionId = () => `codex-${Date.now()}`;

const statusBadgeClass = status => {
	switch (status) {
		case 'connected':
		case 'authenticated':
		case 'sessionactive':
			return 'bg-green-100 text-green-700 border-green-200';
		case 'connecting':
			return 'bg-blue-100 text-blue-700 border-blue-200';
		case 'error':
			return 'bg-red-100 text-red-700 border-red-200';
		case 'closed':
			return 'bg-gray-100 text-gray-600 border-gray-200';
		default:
			return 'bg-gray-100 text-gray-600 border-gray-200';
	}
};

const formatTime = timestamp => {
	const date = new Date(timestamp || Date.now());
	return date.toLocaleTimeString('zh-CN', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
};

const statusLabel = status => {
	if (!status) return 'idle';
	const map = {
		connecting: 'connecting',
		connected: 'connected',
		authenticated: 'authenticated',
		sessionactive: 'session_active',
		closed: 'closed',
		error: 'error'
	};
	return map[status] || status;
};

const parseArgs = raw =>
	raw
		.split(/\s+/)
		.map(item => item.trim())
		.filter(Boolean);

function CodexPage() {
	const {
		sessions,
		activeSessionId,
		isSending,
		startSession,
		stopSession,
		setActiveSession,
		sendMessage,
		approveAction
	} = useCodexStore();
	const { tabs, addTab } = useAppStore();

	const [workspacePath, setWorkspacePath] = useState('');
	const [workspaceError, setWorkspaceError] = useState('');
	const [sendError, setSendError] = useState('');
	const [messageInput, setMessageInput] = useState('');
	const [filesInput, setFilesInput] = useState('');
	const cliPath = 'codex';
	const cliArgs = 'mcp-server';

	useEffect(() => {
		if (!tabs.includes('codex')) {
			addTab('codex');
		}
	}, [tabs, addTab]);

	const activeSession = sessions.find(
		session => session.id === activeSessionId
	);

	useEffect(() => {
		if (!activeSession?.workspace) return;
		if (activeSession.workspace === workspacePath) return;
		setWorkspacePath(activeSession.workspace);
		setWorkspaceError('');
	}, [activeSession, workspacePath]);

	const handlePickWorkspace = async () => {
		const directory = await open({
			directory: true,
			multiple: false,
			title: '选择 Codex 工作目录'
		});

		if (directory) {
			setWorkspacePath(String(directory));
			setWorkspaceError('');
			setSendError('');
		}
	};

	const handlePickFiles = async () => {
		const selected = await open({
			directory: false,
			multiple: true,
			title: '选择发送的文件'
		});

		if (!selected) return;

		const list = Array.isArray(selected) ? selected : [selected];
		setFilesInput(list.join(', '));
	};

	const handleSend = async () => {
		if (!workspacePath.trim()) {
			setWorkspaceError('请先选择工作目录');
			return;
		}
		if (!messageInput.trim()) return;
		setSendError('');
		const files = filesInput
			.split(',')
			.map(item => item.trim())
			.filter(Boolean);
		let sessionId = activeSession?.id;
		try {
			if (!sessionId) {
				const nextSessionId = buildSessionId();
				const folderName =
					workspacePath.trim().split('/').filter(Boolean).pop() || 'Codex';
				const parsedArgs = parseArgs(cliArgs || '');
				await startSession({
					sessionId: nextSessionId,
					title: folderName,
					workspace: workspacePath.trim(),
					cliPath,
					cliArgs: parsedArgs.length ? parsedArgs : undefined
				});
				sessionId = nextSessionId;
			}
			await sendMessage({
				sessionId,
				content: messageInput.trim(),
				files: files.length ? files : undefined
			});
			setMessageInput('');
			setFilesInput('');
		} catch (error) {
			setSendError(error?.message || String(error));
		}
	};

	return (
		<div className='h-full flex flex-col bg-gray-50'>
			<div className='flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] min-h-0'>
				<aside className='border-r border-gray-200 bg-white flex flex-col'>
					<div className='p-4 border-b border-gray-100'>
						<div className='flex items-center justify-between'>
							<div className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
								<Bot className='h-4 w-4 text-blue-600' />
								Codex 会话
							</div>
						</div>
					</div>

					<ScrollArea className='flex-1'>
						<div className='p-3 space-y-2'>
							{sessions.map(session => (
								<div
									key={session.id}
									className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
										session.id === activeSessionId
											? 'border-blue-300 bg-blue-50'
											: 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/50'
									}`}
									onClick={() => setActiveSession(session.id)}>
									<div className='flex items-center justify-between'>
										<span className='font-medium text-gray-700 truncate'>
											{session.title}
										</span>
										<Badge
											variant='outline'
											className={`text-[10px] ${statusBadgeClass(session.status)}`}>
											{statusLabel(session.status)}
										</Badge>
									</div>
									<p className='text-[11px] text-gray-500 mt-1 truncate'>
										{session.workspace}
									</p>
								</div>
							))}
							{sessions.length === 0 && (
								<div className='text-xs text-gray-400 text-center py-8'>
									还没有 Codex 会话，发送消息后会自动创建
								</div>
							)}
						</div>
					</ScrollArea>
				</aside>

				<section className='flex flex-col min-h-0'>
					<div className='border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between'>
						<div className='flex items-center gap-3'>
							<div className='h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center'>
								<Bot className='h-5 w-5 text-blue-600' />
							</div>
						<div>
							<div className='text-sm font-semibold text-gray-800'>
								{activeSession?.title || '未选择会话'}
							</div>
							<p className='text-xs text-gray-500'>
								{activeSession?.workspace || '请选择或创建 Codex 会话'}
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
						<div className='flex items-center gap-2'>
							{activeSession && (
								<Badge
									variant='outline'
									className={`text-xs ${statusBadgeClass(activeSession.status)}`}>
									{statusLabel(activeSession.status)}
								</Badge>
							)}
							<Button
								variant='outline'
								size='sm'
								onClick={() =>
									activeSession && stopSession(activeSession.id)
								}
								disabled={!activeSession}>
								<StopCircle className='h-4 w-4 mr-2' />
								停止会话
							</Button>
						</div>
					</div>

					<div className='flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] min-h-0'>
						<div className='flex flex-col min-h-0'>
							<ScrollArea className='flex-1'>
								<div className='px-6 py-4 space-y-3'>
									{activeSession?.events?.map(event => (
										<Card key={event.id} className='border-gray-200'>
											<CardHeader className='py-2 px-3 flex flex-row items-center justify-between'>
												<div className='flex items-center gap-2 text-xs text-gray-500'>
													<Activity className='h-3.5 w-3.5 text-blue-500' />
													<span className='uppercase tracking-wide'>
														{event.kind}
													</span>
												</div>
												<span className='text-[10px] text-gray-400'>
													{formatTime(event.timestamp)}
												</span>
											</CardHeader>
											<CardContent className='px-3 pb-3 pt-0'>
												{typeof event.payload === 'string' ? (
													<div className='text-sm text-gray-700 whitespace-pre-wrap font-mono'>
														{event.payload}
													</div>
												) : (
													<pre className='text-[11px] text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-md p-2 border border-gray-100'>
														{JSON.stringify(event.payload, null, 2)}
													</pre>
												)}
											</CardContent>
										</Card>
									))}
									{!activeSession && (
										<div className='text-sm text-gray-400 text-center py-12'>
											创建 Codex 会话以查看消息流。
										</div>
									)}
									{activeSession && activeSession.events.length === 0 && (
										<div className='text-sm text-gray-400 text-center py-12'>
											暂无事件，发送消息开始交互。
										</div>
									)}
								</div>
							</ScrollArea>

							<div className='border-t border-gray-200 bg-white p-4'>
								<div className='flex items-center gap-2 mb-2 text-xs text-gray-500'>
									<ShieldCheck className='h-3.5 w-3.5 text-blue-500' />
									发送消息
								</div>
								
								<div className='rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all'>
									{/* Toolbar inside the input container */}
									<div className='flex items-center gap-2 p-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg'>
										<Badge variant='outline' className='text-[10px] bg-white'>
											{cliPath || 'codex'}
										</Badge>
										<div className='h-4 w-[1px] bg-gray-200 mx-1' />
										<Button
											variant='ghost'
											size='sm'
											className='h-6 px-2 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50'
											onClick={handlePickWorkspace}
											disabled={isSending}
											title="选择工作目录">
											<FolderOpen className='h-3.5 w-3.5 mr-1.5' />
											<span className='truncate max-w-[150px]'>
												{workspacePath ? (
													workspacePath.split('/').pop()
												) : (
													<span className='text-gray-400'>选择工作目录</span>
												)}
											</span>
										</Button>
										<Button
											variant='ghost'
											size='sm'
											className='h-6 px-2 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50'
											onClick={handlePickFiles}
											disabled={isSending}
											title="选择文件上下文">
											<FileDiff className='h-3.5 w-3.5 mr-1.5' />
											<span>文件</span>
											{filesInput && (
												<span className='ml-1 bg-blue-100 text-blue-700 px-1 rounded-sm text-[9px]'>
													{filesInput.split(',').length}
												</span>
											)}
										</Button>
									</div>

									{/* Status/Error messages inside/below toolbar if needed */}
									{(!workspacePath && workspaceError) && (
										<div className='px-3 py-1 text-[10px] text-red-500 bg-red-50 border-b border-red-100'>
											{workspaceError}
										</div>
									)}
									
									{/* Textarea */}
									<textarea
										value={messageInput}
										onChange={event => setMessageInput(event.target.value)}
										onKeyDown={event => {
											if (event.isComposing || event.keyCode === 229) {
												return;
											}
											if (event.key === 'Enter') {
												if (event.metaKey || event.ctrlKey) {
													// Cmd/Ctrl + Enter: Insert newline
													event.preventDefault();
													setMessageInput(prev => prev + '\n');
												} else if (!event.shiftKey) {
													// Enter only: Send
													event.preventDefault();
													handleSend();
												}
											}
										}}
										placeholder='输入指令或问题 (Enter 发送, Cmd+Enter 换行)'
										className='w-full min-h-[80px] max-h-[300px] p-3 text-sm resize-none focus:outline-none bg-transparent rounded-b-lg'
										disabled={isSending}
									/>
									
									{/* Footer info (optional, e.g. full path tooltip or file list) */}
									{(workspacePath || filesInput) && (
										<div className='px-3 py-1.5 border-t border-gray-100 bg-gray-50/30 rounded-b-lg flex flex-wrap gap-2'>
											{workspacePath && (
												<div className='text-[10px] text-gray-400 truncate max-w-full flex items-center' title={workspacePath}>
													<span className='opacity-70 mr-1'>PWD:</span> {workspacePath}
												</div>
											)}
											{filesInput && (
												<div className='text-[10px] text-gray-500 flex items-center w-full'>
													<span className='opacity-70 mr-1'>Files:</span> 
													<span className='truncate'>{filesInput}</span>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</div>

						<aside className='border-l border-gray-200 bg-gray-50 flex flex-col min-h-0'>
							<div className='p-4 border-b border-gray-200'>
								<div className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
									<ShieldCheck className='h-4 w-4 text-blue-600' />
									待确认操作
								</div>
							</div>
							<ScrollArea className='flex-1'>
								<div className='p-4 space-y-3'>
									{activeSession?.pendingActions?.map(action => (
										<Card key={action.callId} className='border-gray-200'>
											<CardContent className='p-3 space-y-2'>
												<div className='flex items-center gap-2 text-sm font-medium text-gray-700'>
													<AlertTriangle className='h-4 w-4 text-orange-500' />
													{action.method || '待确认请求'}
												</div>
												{action.params && (
													<pre className='text-[11px] text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-md p-2 border border-gray-100'>
														{JSON.stringify(action.params, null, 2)}
													</pre>
												)}
												<div className='flex items-center gap-2'>
													<Button
														size='sm'
														onClick={() =>
															approveAction({
																sessionId: activeSession.id,
																callId: action.callId,
																decision: 'approve'
															})
														}
													>
														通过
													</Button>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															approveAction({
																sessionId: activeSession.id,
																callId: action.callId,
																decision: 'reject'
															})
														}
													>
														拒绝
													</Button>
												</div>
											</CardContent>
										</Card>
									))}
									{(!activeSession ||
										activeSession.pendingActions.length === 0) && (
										<div className='text-xs text-gray-400 text-center py-6'>
											暂无待确认请求
										</div>
									)}
								</div>
							</ScrollArea>

							<div className='border-t border-gray-200 p-4 bg-white'>
								<div className='flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3'>
									<FileDiff className='h-4 w-4 text-blue-600' />
									文件变更
								</div>
								<div className='space-y-2'>
									{activeSession?.fileChanges?.map(change => (
										<div
											key={change.id}
											className='text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2'>
											<div className='text-[10px] text-gray-400 mb-1'>
												{formatTime(change.timestamp)}
											</div>
											<pre className='whitespace-pre-wrap font-mono'>
												{JSON.stringify(change.payload, null, 2)}
											</pre>
										</div>
									))}
									{(!activeSession || activeSession.fileChanges.length === 0) && (
										<div className='text-xs text-gray-400 text-center py-4'>
											暂无文件变更记录
										</div>
									)}
								</div>
							</div>
						</aside>
					</div>
				</section>
			</div>
		</div>
	);
}

export default CodexPage;
