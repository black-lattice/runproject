import { useRef, useEffect, useState } from 'react';
import {
	FolderOpen,
	File as FileIcon,
	Folder as FolderIcon,
	ShieldCheck,
	AlertTriangle,
	Check,
	X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export function InputArea({
	workspacePath,
	workspaceError,
	messageInput,
	onMessageChange,
	onKeyDown,
	sendError,
	isSending,
	activeSession,
	messages,
	settings,
	onModelChange,
	modelGroups,
	currentModelValue,
	showMentions,
	filteredFiles,

	mentionNavIndex,
	onSelectFile,
	textareaRef,
	onPickWorkspace,
	onCompositionStart,
	onCompositionEnd,
	pendingAction,
	onApprove,
	onDropEntry
}) {
	const backdropRef = useRef(null);
	const [permissionSelection, setPermissionSelection] = useState('approve'); // 'approve' | 'reject'

	// Reset selection when pending action appears
	useEffect(() => {
		if (pendingAction) {
			setPermissionSelection('approve');
			// Try to focus the textarea to capture keyboard events, 
			// though usually the user is already focused there.
			textareaRef.current?.focus();
		}
	}, [pendingAction]);

	// Sync scroll from textarea to backdrop
	const handleScroll = e => {
		if (backdropRef.current) {
			backdropRef.current.scrollTop = e.target.scrollTop;
		}
	};

	// Highlight logic
	const renderHighlights = text => {
		if (!text) return null;
		const parts = text.split(/(@[\w\u4e00-\u9fa5\.\-\/]+)/g);

		return parts.map((part, i) => {
			if (part.startsWith('@') && part.length > 1) {
				return (
					<span
						key={i}
						className='text-emerald-600 bg-emerald-50 rounded-sm font-semibold'
					>
						{part}
					</span>
				);
			}
			return <span key={i}>{part}</span>;
		});
	};

	const isPendingWorkspace = activeSession?.status === 'pending_workspace';
	const isCodexLoading =
		activeSession?.provider === 'codex' &&
		!activeSession?.ready &&
		!isPendingWorkspace;

	// Intercept keyboard events for permission handling
	const handleInputKeyDown = e => {
		if (pendingAction) {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') {
				e.preventDefault();
				setPermissionSelection(prev => (prev === 'approve' ? 'reject' : 'approve'));
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				onApprove(permissionSelection);
				return;
			}
			// Block other input when permission is pending? 
			// Maybe better to allow typing but purely for navigation?
			// Let's block 'Enter' only if it's strictly for confirmation.
			// Actually, usually users stop typing when a prompt appears.
			return; 
		}
		
		onKeyDown(e);
	};

	const handleDragOver = e => {
		if (isSending || isCodexLoading || isPendingWorkspace) {
			return;
		}
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	};

	const handleDrop = e => {
		if (isSending || isCodexLoading || isPendingWorkspace) {
			return;
		}
		e.preventDefault();
		const raw =
			e.dataTransfer.getData('application/json') ||
			e.dataTransfer.getData('text/plain');
		if (!raw) return;
		try {
			const entry = JSON.parse(raw);
			if (entry?.name) {
				onDropEntry?.(entry);
			}
		} catch {
			// ignore invalid drag data
		}
	};

	return (
		<div className='bg-transparent p-4 relative'>
			{/* Permission Request Floating Card */} 
			{pendingAction && (
				<div className='absolute bottom-full left-4 right-4 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2'>
					<div className='bg-white rounded-xl border border-amber-200 shadow-lg p-4 flex flex-col gap-3'>
						<div className='flex items-center gap-3 border-b border-amber-100 pb-3'>
							<div className='h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0'>
								<ShieldCheck className='h-5 w-5 text-amber-600' />
							</div>
							<div>
								<div className='font-semibold text-gray-800 text-sm'>
									需要权限确认
								</div>
								<div className='text-xs text-gray-500'>
									Agent 请求执行敏感操作，请确认是否允许。
								</div>
							</div>
						</div>
						
						{pendingAction.params && (
							<div className='bg-gray-50 rounded-md p-3 font-mono text-xs text-gray-600 overflow-x-auto border border-gray-100'>
								{pendingAction.params.codex_command 
									? `> ${Array.isArray(pendingAction.params.codex_command) ? pendingAction.params.codex_command.join(' ') : pendingAction.params.codex_command}`
									: JSON.stringify(pendingAction.params, null, 2)
								}
							</div>
						)}

						<div className='flex gap-2 pt-1'>
							<button
								className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${permissionSelection === 'reject'
										? 'bg-red-50 text-red-700 ring-2 ring-red-200'
										: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
								onClick={() => onApprove('reject')}
							>
								<X className='w-4 h-4' />
								拒绝 (Reject)
							</button>
							<button
								className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${permissionSelection === 'approve'
										? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
										: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
								onClick={() => onApprove('approve')}
							>
								<Check className='w-4 h-4' />
								批准 (Approve)
							</button>
						</div>
						
						<div className='text-[10px] text-center text-gray-400'>
							使用 <kbd className='font-sans bg-gray-100 px-1 rounded'>↑</kbd> <kbd className='font-sans bg-gray-100 px-1 rounded'>↓</kbd> 切换，<kbd className='font-sans bg-gray-100 px-1 rounded'>Enter</kbd> 确认
						</div>
					</div>
				</div>
			)}

			{/* Status Display Area */} 
			<div className='mb-2 space-y-1'>
				{activeSession?.status && activeSession.status !== 'ready' && (
					<div className='flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50/50 px-2 py-1 rounded border border-emerald-100/50 animate-pulse'>
						<span className='relative flex h-1.5 w-1.5'>
							<span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75'></span>
							<span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500'></span>
						</span>
						<span className='font-medium'>状态: {activeSession.status}</span>
					</div>
				)}
				{messages &&
					messages.filter(m => m.role === 'system').length > 0 && (
						<div className='flex items-center gap-2 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100 truncate'>
							<span className='opacity-70 shrink-0 uppercase tracking-tight font-bold'>
									LOG:
							</span>
							<span className='truncate'>
									{
										messages.filter(m => m.role === 'system').slice(-1)[0]
														.content
									}
							</span>
						</div>
					)}
			</div>

			<div className={`rounded-xl border bg-white shadow-sm transition-all relative overflow-hidden ${pendingAction ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-400'}`}> 
				{/* Toolbar inside the input container */} 
				<div className='flex items-center gap-2 p-2 bg-white rounded-t-xl'>
					<Button
						variant='ghost'
						size='sm'
						className='h-7 px-2.5 text-xs text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors'
						onClick={onPickWorkspace}
						disabled={isSending}
						title='选择工作目录'
					>
						<FolderOpen className='h-3.5 w-3.5 mr-2' />
						<span className='truncate max-w-[240px] font-medium'>
							{workspacePath ? (
								workspacePath.split('/').pop()
						) : (
								<span className='text-gray-400'>选择工作目录</span>
							)}
						</span>
					</Button>
				</div>

				{/* Status/Error messages */} 
				{!workspacePath && workspaceError && (
					<div className='px-3 py-1.5 text-[10px] text-red-500 bg-red-50'>
						{workspaceError}
					</div>
				)}

				{/* Mention Dropdown */} 
				{showMentions && (
					<div className='absolute bottom-[calc(100%-44px)] left-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto'>
						<div className='p-1'>
							{filteredFiles.length > 0 ? (
								filteredFiles.map((file, index) => (
									<div
										key={index}
										className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs ${index === mentionNavIndex
														? 'bg-emerald-50 text-emerald-700'
														: 'hover:bg-gray-50 text-gray-700'}`}
										onClick={() => onSelectFile(file)}
									>
										{file.isDir ? (
											<FolderIcon className='h-3 w-3' />
										) : (
											<FileIcon className='h-3 w-3' />
										)}
										<span className='truncate'>{file.name}</span>
									</div>
								))
							) : (
								<div className='px-2 py-1.5 text-xs text-gray-400 text-center'>
									无匹配文件
								</div>
							)}
						</div>
					</div>
				)}

				{/* Textarea & Backdrop Container */} 
				<div className='relative w-full min-h-[100px] max-h-[300px]'>
					{/* Backdrop for Highlighting */} 
					<div
						ref={backdropRef}
						className='absolute inset-0 w-full h-full p-4 text-sm font-mono leading-6 whitespace-pre-wrap break-words overflow-auto pointer-events-none z-0 bg-transparent text-gray-800'
						aria-hidden='true'
					>
						{renderHighlights(messageInput)}
						{messageInput.endsWith('\n') && <br />}
					</div>

					{/* Actual Textarea */} 
					<textarea
						ref={textareaRef}
						value={messageInput}
						onChange={onMessageChange}
						onScroll={handleScroll}
						onCompositionStart={onCompositionStart}
						onCompositionEnd={onCompositionEnd}
						onKeyDown={handleInputKeyDown}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
						placeholder={
							isPendingWorkspace
								? '请先选择工作目录...'
								: isCodexLoading
									? 'Codex 正在加载 MCP，请稍候…'
									: '描述任务... 使用 @ 引用文件 (Enter 发送)'
						}
						className='relative z-10 w-full h-full min-h-[100px] max-h-[300px] p-4 text-sm font-mono leading-6 resize-none focus:outline-none bg-transparent text-transparent caret-emerald-600 selection:bg-blue-100 selection:text-transparent'
						disabled={isSending || isCodexLoading || isPendingWorkspace}
						spellCheck={false}
					/>
				</div>

				{/* Footer info & Model Selector */} 
				<div className='px-3 py-2 bg-white rounded-b-xl flex items-center justify-end gap-4'>
					<div className='flex items-center gap-2 shrink-0'>
						<Select
							value={currentModelValue}
							onValueChange={onModelChange}
						>
							<SelectTrigger className='h-7 text-[10px] min-w-[120px] bg-white border-gray-200 hover:border-emerald-400 transition-colors shadow-none'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{modelGroups.map(group => (
									<div key={group.label}>
										<div className='px-2 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider bg-gray-50/50'>
											{group.label}
										</div>
										{group.models.map(model => (
											<SelectItem
												key={model.value}
												value={model.value}
												className='text-[10px]'
											>
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
		</div>
	);
}
