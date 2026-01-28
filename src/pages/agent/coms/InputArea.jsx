import { useRef, useEffect } from 'react';
import {
	FolderOpen,
	File as FileIcon,
	Folder as FolderIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';

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
	showMentions,
	filteredFiles,
	mentionNavIndex,
	onSelectFile,
	textareaRef,
	onPickWorkspace,
	onCompositionStart,
	onCompositionEnd
}) {
	const backdropRef = useRef(null);

	// Sync scroll from textarea to backdrop
	const handleScroll = e => {
		if (backdropRef.current) {
			backdropRef.current.scrollTop = e.target.scrollTop;
		}
	};

	// Highlight logic
	const renderHighlights = text => {
		if (!text) return null;
		// Split by @mentions (simple regex for filenames/words)
		// Captures the delimiter so we can wrap it
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

	return (
		<div className='border-t border-gray-200 bg-white p-4'>
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

			<div className='rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-400 transition-all relative'>
				{/* Toolbar inside the input container */}
				<div className='flex items-center gap-2 p-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg'>
					<Button
						variant='ghost'
						size='sm'
						className='h-6 px-2 text-xs text-gray-600 hover:text-emerald-600 hover:bg-emerald-50'
						onClick={onPickWorkspace}
						disabled={isSending}
						title='选择工作目录'
					>
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
				{!workspacePath && workspaceError && (
					<div className='px-3 py-1 text-[10px] text-red-500 bg-red-50 border-b border-red-100'>
						{workspaceError}
					</div>
				)}

				{/* Mention Dropdown */}
				{showMentions && (
					<div className='absolute bottom-[calc(100%-40px)] left-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto'>
						<div className='p-1'>
							{filteredFiles.length > 0 ? (
								filteredFiles.map((file, index) => (
									<div
										key={index}
										className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs ${
											index === mentionNavIndex
												? 'bg-emerald-50 text-emerald-700'
												: 'hover:bg-gray-50 text-gray-700'
										}`}
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
				<div className='relative w-full min-h-[80px] max-h-[300px]'>
					{/* Backdrop for Highlighting */}
					<div
						ref={backdropRef}
						className='absolute inset-0 w-full h-full p-3 text-sm font-mono leading-6 whitespace-pre-wrap break-words overflow-auto pointer-events-none z-0 bg-transparent text-gray-800'
						aria-hidden='true'
					>
						{renderHighlights(messageInput)}
						{/* Add a zero-width space or similar to ensure height match if empty? 
                            Actually, just " " is usually enough for the last newline to render properly in pre-wrap 
                            if the user types a trailing newline. 
                        */}
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
						onKeyDown={onKeyDown}
						placeholder={
							settings?.provider === 'codex' &&
							activeSession &&
							!activeSession?.ready
								? 'Codex 正在加载 MCP，请稍候…'
								: '描述任务... 使用 @ 引用文件 (Enter 发送)'
						}
						className='relative z-10 w-full h-full min-h-[80px] max-h-[300px] p-3 text-sm font-mono leading-6 resize-none focus:outline-none bg-transparent text-transparent caret-emerald-600 selection:bg-blue-100 selection:text-transparent'
						disabled={
							isSending ||
							(settings?.provider === 'codex' &&
								activeSession &&
								!activeSession?.ready)
						}
						spellCheck={false}
					/>
				</div>

				{/* Footer info & Model Selector */}
				<div className='px-3 py-1.5 border-t border-gray-100 bg-gray-50/30 rounded-b-lg flex items-center justify-between gap-4'>
					<div className='flex-1 min-w-0'>
						{workspacePath && (
							<div
								className='text-[10px] text-gray-400 truncate flex items-center'
								title={workspacePath}
							>
								<span className='opacity-70 mr-1'>PWD:</span> {workspacePath}
							</div>
						)}
					</div>
					<div className='flex items-center gap-2 shrink-0'>
						<Select
							value={settings?.model || 'gpt-4.1-mini'}
							onValueChange={onModelChange}
						>
							<SelectTrigger className='h-6 text-[10px] w-[140px] bg-white border-gray-200'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{modelGroups.map(group => (
									<div key={group.label}>
										<div className='px-2 py-1 text-[10px] text-gray-400 font-semibold'>
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

			<p className='text-[10px] text-gray-400 mt-2 ml-1'>
				支持多轮对话与工具调用，写入/删除等操作需审批
			</p>
		</div>
	);
}