import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { open } from '@tauri-apps/plugin-dialog';
import { Bot, FolderOpen, Send, PlusCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAgentStore } from '@/store/useAgentStore';
import { useAppStore } from '@/store/useAppStore';

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
		settingsStatus,
		settingsError,
		loadSettings,
		saveSettings,
		sessions,
		activeSessionId,
		isSending,
		startSession,
		setActiveSession,
		sendMessage,
		appendMessage,
		approveAction
	} = useAgentStore();
	const { tabs, addTab } = useAppStore();

	const [workspacePath, setWorkspacePath] = useState('');
	const [workspaceError, setWorkspaceError] = useState('');
	const [messageInput, setMessageInput] = useState('');
	const [sendError, setSendError] = useState('');
	const [rememberApproval, setRememberApproval] = useState(false);

	useEffect(() => {
		if (!tabs.includes('agent')) {
			addTab('agent');
		}
	}, [tabs, addTab]);

	useEffect(() => {
		loadSettings().catch(() => null);
	}, [loadSettings]);

	const activeSession = sessions.find(session => session.id === activeSessionId);

	useEffect(() => {
		if (!activeSession?.workspace) return;
		if (activeSession.workspace === workspacePath) return;
		setWorkspacePath(activeSession.workspace);
		setWorkspaceError('');
	}, [activeSession, workspacePath]);

	const pendingAction = activeSession?.pendingActions?.[0] || null;

	const handlePickWorkspace = async () => {
		const directory = await open({
			directory: true,
			multiple: false,
			title: '选择 Agent 工作目录'
		});

		if (directory) {
			setWorkspacePath(String(directory));
			setWorkspaceError('');
			setSendError('');
		}
	};

	const ensureSession = async () => {
		let sessionId = activeSession?.id;
		if (sessionId) return sessionId;

		const nextSessionId = buildSessionId();
		const folderName = workspacePath.trim().split('/').filter(Boolean).pop() || '工作区';
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
		try {
			const sessionId = await ensureSession();
			if (settings?.provider === 'codex' && !activeSession?.ready) {
				setSendError('Codex 正在加载 MCP，请稍候再发送');
				return;
			}
			appendMessage(sessionId, 'user', messageInput.trim());
			await sendMessage({ sessionId, content: messageInput.trim() });
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
		const folderName = workspacePath.trim().split('/').filter(Boolean).pop() || '工作区';
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

	const messages = useMemo(() => activeSession?.messages || [], [activeSession]);

	const handleModelChange = async value => {
		try {
			const newProvider = inferProvider(value);
			const baseUrl =
				newProvider === 'deepseek'
					? DEFAULT_DEEPSEEK_BASE_URL
					: '';
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

	return (
		<div className='h-full flex flex-col bg-gray-50'>
			<div className='flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] min-h-0'>
				<aside className='border-r border-gray-200 bg-white flex flex-col'>
					<div className='p-4 border-b border-gray-100'>
						<div className='flex items-center justify-between'>
							<div className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
								<Bot className='h-4 w-4 text-emerald-600' />
								Agent 会话
							</div>
							<Button size='sm' variant='ghost' className='h-8 w-8 p-0' onClick={handleNewSession}>
								<PlusCircle className='h-4 w-4' />
							</Button>
						</div>
					</div>

					<ScrollArea className='flex-1'>
						<div className='p-3 space-y-2'>
							{sessions.map(session => (
								<div
									key={session.id}
									className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
										session.id === activeSessionId
											? 'border-emerald-300 bg-emerald-50'
											: 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/50'
									}`}
									onClick={() => setActiveSession(session.id)}>
									<div className='flex items-center justify-between'>
										<span className='font-medium text-gray-700 truncate'>{session.title}</span>
										<Badge variant='outline' className='text-[10px]'>
											{session.status || 'idle'}
										</Badge>
									</div>
									<p className='text-[11px] text-gray-500 mt-1 truncate'>{session.workspace}</p>
								</div>
							))}
							{sessions.length === 0 && (
								<div className='text-xs text-gray-400 text-center py-8'>
									还没有 Agent 会话，请先选择目录并发送消息
								</div>
							)}
						</div>
					</ScrollArea>
				</aside>

				<section className='flex flex-col min-h-0'>
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
								{sendError && <p className='text-xs text-red-500 mt-1'>{sendError}</p>}
								{activeSession?.error && (
									<p className='text-xs text-red-500 mt-1'>{activeSession.error}</p>
								)}
							</div>
						</div>
					</div>

					<div className='flex-1 flex flex-col min-h-0'>
						<div className='flex flex-col flex-1 min-h-0'>
							<ScrollArea className='flex-1'>
								<div className='p-6 space-y-4'>
									{messages.map(message => {
										if (message.role === 'system') {
											const isError = /error|fail|中断|拒绝/i.test(message.content);
											return (
												<div key={message.id} className="flex justify-center my-2 px-4">
													<span className={`text-[10px] px-3 py-1 rounded-full border max-w-full truncate ${
														isError 
															? 'bg-amber-50 text-amber-600 border-amber-100' 
															: 'bg-gray-50 text-gray-400 border-gray-100'
													}`}>
														{message.content}
													</span>
												</div>
											);
										}
										return (
											<div
												key={message.id}
												className={`rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
													message.role === 'user'
														? 'bg-emerald-600 text-white ml-auto max-w-[85%]'
														: 'bg-white text-gray-700 border border-gray-100 max-w-[85%]'
												}`}
											>
											{message.reasoning && (
												<div className="mb-3 pb-3 border-b border-gray-100">
													<div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
														<Bot className="h-3 w-3" />
														思考过程
													</div>
													<div className="text-gray-500 italic text-xs leading-normal bg-gray-50/50 rounded-lg p-3 border border-gray-50">
														<ReactMarkdown>{message.reasoning}</ReactMarkdown>
													</div>
												</div>
											)}
											<ReactMarkdown
												components={{
													p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
													ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
													ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
													li: ({ children }) => <li className="mb-1">{children}</li>,
													h1: ({ children }) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
													h2: ({ children }) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
													h3: ({ children }) => <h3 className="text-base font-bold mb-2">{children}</h3>,
													code({ node, inline, className, children, ...props }) {
														const match = /language-(\w+)/.exec(className || '');
														return !inline && match ? (
															<SyntaxHighlighter
																style={vscDarkPlus}
																language={match[1]}
																PreTag="div"
																className="rounded-md my-2"
																{...props}
															>
																{String(children).replace(/\n$/, '')}
															</SyntaxHighlighter>
														) : (
															<code 
																className={`px-1 py-0.5 rounded text-xs ${
																	message.role === 'user' 
																		? 'bg-emerald-700 text-emerald-50' 
																		: 'bg-gray-100 text-gray-800'
																}`} 
																{...props}
															>
																{children}
															</code>
														);
													}
												}}
												className="markdown-content"
											>
												{message.content}
											</ReactMarkdown>
										</div>
										);
									})}
									{messages.length === 0 && (
										<div className='text-sm text-gray-400'>
											请输入你的需求，Agent 会流式输出结果
										</div>
									)}
									{isSending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
										<div className="flex items-center gap-2 text-gray-400 text-xs px-4 py-2 animate-pulse">
											<Bot className="h-3 w-3" />
											<span>Codex 正在思考...</span>
										</div>
									)}

									{pendingAction && (
										<div className="rounded-xl bg-white border border-amber-200 shadow-md p-3 mb-4 mx-auto max-w-[400px] sticky bottom-0 z-10">
											<div className="flex items-center justify-between gap-4">
												<div className="flex items-center gap-2 min-w-0">
													<div className="h-7 w-7 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
														<ShieldCheck className="h-4 w-4 text-amber-600" />
													</div>
													<div className="text-xs font-medium text-gray-700 truncate">
														权限确认请求
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Button 
														size="sm" 
														variant="ghost" 
														onClick={() => handleApprove('reject')} 
														className="h-7 px-3 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50"
													>
														拒绝
													</Button>
													<Button 
														size="sm" 
														onClick={() => handleApprove('approve')} 
														className="h-7 px-4 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
													>
														批准执行
													</Button>
												</div>
											</div>
										</div>
									)}
								</div>
							</ScrollArea>

							<div className='border-t border-gray-200 bg-white p-4'>
								<div className='rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-400 transition-all'>
									{/* Toolbar inside the input container */}
									<div className='flex items-center gap-2 p-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg'>
										<Button
											variant='ghost'
											size='sm'
											className='h-6 px-2 text-xs text-gray-600 hover:text-emerald-600 hover:bg-emerald-50'
											onClick={handlePickWorkspace}
											disabled={isSending}
											title="选择工作目录">
											<FolderOpen className='h-3.5 w-3.5 mr-1.5' />
											<span className='truncate max-w-[200px]'>
												{workspacePath ? (
													workspacePath.split('/').pop()
												) : (
													<span className='text-gray-400'>选择工作目录</span>
												)}
											</span>
										</Button>
									</div>

									{/* Status/Error messages */}
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
											if (event.key === 'Enter') {
												if (event.metaKey || event.ctrlKey) {
													event.preventDefault();
													setMessageInput(prev => prev + '\n');
												} else if (!event.shiftKey) {
													event.preventDefault();
													handleSend();
												}
											}
										}}
										placeholder={
											settings?.provider === 'codex' && activeSession && !activeSession?.ready
												? 'Codex 正在加载 MCP，请稍候…'
												: '描述你的任务或问题 (Enter 发送, Cmd+Enter 换行)'
										}
										className='w-full min-h-[80px] max-h-[300px] p-3 text-sm resize-none focus:outline-none bg-transparent'
										disabled={isSending || (settings?.provider === 'codex' && activeSession && !activeSession?.ready)}
									/>

									{/* Footer info & Model Selector */}
									<div className='px-3 py-1.5 border-t border-gray-100 bg-gray-50/30 rounded-b-lg flex items-center justify-between gap-4'>
										<div className='flex-1 min-w-0'>
											{workspacePath && (
												<div className='text-[10px] text-gray-400 truncate flex items-center' title={workspacePath}>
													<span className='opacity-70 mr-1'>PWD:</span> {workspacePath}
												</div>
											)}
										</div>
										<div className='flex items-center gap-2 shrink-0'>
											<Select
												value={settings?.model || 'gpt-4.1-mini'}
												onValueChange={handleModelChange}
											>
												<SelectTrigger className="h-6 text-[10px] w-[140px] bg-white border-gray-200">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{modelGroups.map(group => (
														<div key={group.label}>
															<div className='px-2 py-1 text-[10px] text-gray-400 font-semibold'>
																{group.label}
															</div>
															{group.models.map(model => (
																<SelectItem key={model.value} value={model.value} className="text-[10px]">
																	{model.label}
																</SelectItem>
															))}
														</div>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								</div>
								
								<p className='text-[10px] text-gray-400 mt-2 ml-1'>
									支持多轮对话与工具调用，写入/删除等操作需审批
								</p>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

export default AgentPage;
