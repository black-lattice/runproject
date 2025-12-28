import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Terminal, X, FolderOpen } from 'lucide-react';
import { XtermTerminal } from '@/components/Terminal';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';

const STORAGE_KEY = 'terminal_page_state';

const getInitialTerminalState = () => {
	if (typeof window === 'undefined') {
		return { terminals: [], activeTerminalId: null };
	}

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (!stored) return { terminals: [], activeTerminalId: null };

		const parsed = JSON.parse(stored);
		const storedTerminals = Array.isArray(parsed.terminals)
			? parsed.terminals
			: [];
		const hydratedTerminals = storedTerminals.map((terminal, index) => ({
			...terminal,
			existingSession: true,
			title: terminal.title || `Terminal ${index + 1}`
		}));

		const storedActiveId = parsed.activeTerminalId;
		const hasStoredActive = hydratedTerminals.some(
			t => t.id === storedActiveId
		);

		return {
			terminals: hydratedTerminals,
			activeTerminalId: hasStoredActive
				? storedActiveId
				: (hydratedTerminals[0]?.id ?? null)
		};
	} catch (error) {
		console.error('恢复终端状态失败:', error);
		return { terminals: [], activeTerminalId: null };
	}
};

function TerminalPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialStateRef = useRef(null);
	if (!initialStateRef.current) {
		initialStateRef.current = getInitialTerminalState();
	}
	const [terminals, setTerminals] = useState(
		initialStateRef.current.terminals
	);
	const [activeTerminalId, setActiveTerminalId] = useState(
		initialStateRef.current.activeTerminalId
	);
	const [newTerminalName, setNewTerminalName] = useState('');

	useEffect(() => {
		const sessionId = searchParams.get('sessionId');
		const title = searchParams.get('title');
		const cwd = searchParams.get('cwd');

		if (sessionId && cwd) {
			const decodedCwd = decodeURIComponent(cwd);

			setTerminals(prev => {
				const exists = prev.some(t => t.id === sessionId);
				if (exists) {
					return prev;
				}

				const newTerminal = {
					id: sessionId,
					title: title || `Terminal ${prev.length + 1}`,
					cwd: decodedCwd,
					existingSession: true
				};

				return [...prev, newTerminal];
			});

			setActiveTerminalId(sessionId);
			setSearchParams({});
		}
	}, [searchParams, setSearchParams]);

	const handleAddTerminal = async (customCwd = null) => {
		const title =
			newTerminalName.trim() || `Terminal ${terminals.length + 1}`;

		let cwd = customCwd;
		if (!cwd) {
			try {
				cwd = await homeDir();
			} catch (error) {
				console.error('获取 home 目录失败:', error);
				cwd = '/';
			}
		}

		const newTerminal = {
			id: `terminal-${Date.now()}`,
			title,
			cwd,
			existingSession: false
		};

		setTerminals(prev => [...prev, newTerminal]);
		setActiveTerminalId(newTerminal.id);
		setNewTerminalName('');
	};

	const handleAddTerminalWithDialog = async () => {
		const directory = await open({
			directory: true,
			multiple: false,
			title: '选择终端工作目录'
		});

		if (!directory) return;

		await handleAddTerminal(directory);
	};

	const handleCloseTerminal = (
		terminalId,
		{ skipServerClose = false } = {}
	) => {
		if (!terminalId) return;

		if (!skipServerClose) {
			invoke('close_terminal_session', { sessionId: terminalId }).catch(
				error => {
					console.error('关闭终端会话失败:', error);
				}
			);
		}

		setTerminals(prev => {
			const filtered = prev.filter(t => t.id !== terminalId);
			if (filtered.length === prev.length) return prev;

			const fallbackId = filtered[0]?.id ?? null;
			setActiveTerminalId(current => {
				if (!current) return fallbackId;
				if (current === terminalId) return fallbackId;
				const stillExists = filtered.some(t => t.id === current);
				return stillExists ? current : fallbackId;
			});

			return filtered;
		});
	};

	const activeTerminal = terminals.find(t => t.id === activeTerminalId);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		if (!terminals.length) {
			window.localStorage.removeItem(STORAGE_KEY);
			return;
		}

		const payload = {
			terminals: terminals.map(terminal => ({
				...terminal,
				existingSession: true
			})),
			activeTerminalId: activeTerminalId ?? terminals[0]?.id ?? null
		};

		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		} catch (error) {
			console.error('保存终端状态失败:', error);
		}
	}, [terminals, activeTerminalId]);

	return (
		<div className='h-full flex flex-col bg-white'>
			{terminals.length === 0 ? (
				<div className='flex-1 flex flex-col'>
					<div className='flex items-center justify-between px-4 py-2 border-b bg-gray-50/50'>
						<span className='text-sm font-semibold text-gray-700'>
							终端
						</span>
						<div className='flex items-center gap-1'>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											onClick={() => handleAddTerminal()}
											size='sm'
											variant='ghost'
											className='h-8 w-8 p-0 hover:bg-gray-200'>
											<Plus className='h-4 w-4 text-gray-600' />
										</Button>
									</TooltipTrigger>
									<TooltipContent>新建终端</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											onClick={() =>
												handleAddTerminalWithDialog()
											}
											size='sm'
											variant='ghost'
											className='h-8 w-8 p-0 hover:bg-gray-200'>
											<FolderOpen className='h-4 w-4 text-gray-600' />
										</Button>
									</TooltipTrigger>
									<TooltipContent>选择目录</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
					<div className='flex-1 flex items-center justify-center'>
						<div className='text-center'>
							<div className='bg-gray-100 p-4 rounded-full w-fit mx-auto mb-4'>
								<Terminal className='h-10 w-10 text-gray-400' />
							</div>
							<p className='text-gray-500 mb-4 font-medium'>
								暂无活动终端会话
							</p>
							<Button
								onClick={() => handleAddTerminal()}
								className='bg-blue-600 hover:bg-blue-700'>
								<Plus className='h-4 w-4 mr-2' />
								开启新终端
							</Button>
						</div>
					</div>
				</div>
			) : (
				<div className='flex-1 flex flex-col min-h-0'>
					<div className='flex items-center justify-between border-b bg-gray-50/50 pr-2 h-10'>
						<div className='flex items-center overflow-x-auto no-scrollbar flex-1 h-full'>
							{terminals.map(terminal => {
								const isActive =
									activeTerminalId === terminal.id;
								return (
									<div
										key={terminal.id}
										className={`
                      group relative flex items-center gap-2 px-4 h-full min-w-[120px] max-w-[200px] 
                      cursor-pointer transition-all duration-150 border-r border-gray-200/60
                      ${
							isActive
								? 'bg-white text-blue-600 shadow-[0_1px_0_rgba(255,255,255,1)] z-10'
								: 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-700'
						}
                    `}
										onClick={() =>
											setActiveTerminalId(terminal.id)
										}>
										<Terminal
											className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`}
										/>
										<span className='text-[13px] font-medium truncate flex-1'>
											{terminal.title}
										</span>
										<button
											className={`
                        p-0.5 rounded transition-all duration-150
                        ${isActive ? 'opacity-100 text-gray-400 hover:bg-red-50 hover:text-red-500' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-gray-300/50 hover:text-gray-600'}
                      `}
											onClick={e => {
												e.stopPropagation();
												handleCloseTerminal(
													terminal.id
												);
											}}>
											<X className='h-3 w-3' />
										</button>
									</div>
								);
							})}
						</div>

						<div className='flex items-center gap-0.5 pl-2 ml-2'>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											onClick={() => handleAddTerminal()}
											size='sm'
											variant='ghost'
											className='h-8 w-8 p-0 hover:bg-gray-200'>
											<Plus className='h-4 w-4 text-gray-600' />
										</Button>
									</TooltipTrigger>
									<TooltipContent>新建终端</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											onClick={() =>
												handleAddTerminalWithDialog()
											}
											size='sm'
											variant='ghost'
											className='h-8 w-8 p-0 hover:bg-gray-200'>
											<FolderOpen className='h-4 w-4 text-gray-600' />
										</Button>
									</TooltipTrigger>
									<TooltipContent>选择目录</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>

					<div className='flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]'>
						{activeTerminal && (
							<>
								<div className='flex items-center gap-2 px-4 py-1 bg-[#252526] text-[10px] text-gray-400 font-mono border-b border-white/5 uppercase tracking-wider'>
									<FolderOpen className='h-3 w-3 opacity-60' />
									<span className='truncate opacity-60'>
										{activeTerminal.cwd}
									</span>
								</div>
								<div className='flex-1 relative'>
									{terminals.map(terminal => (
										<div
											key={terminal.id}
											className={`absolute inset-0 ${terminal.id === activeTerminalId ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
											style={{
												transition: 'opacity 150ms'
											}}>
											<XtermTerminal
												sessionId={terminal.id}
												cwd={terminal.cwd}
												existingSession={
													terminal.existingSession ||
													false
												}
												onClose={() =>
													handleCloseTerminal(
														terminal.id,
														{
															skipServerClose: true
														}
													)
												}
											/>
										</div>
									))}
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default TerminalPage;
