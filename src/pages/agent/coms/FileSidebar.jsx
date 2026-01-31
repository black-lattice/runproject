import { FolderOpen, RefreshCw, Folder as FolderIcon, File as FileIcon, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function FileSidebar({
	files,
	filesLoading,
	workspacePath,
	onRefresh,
	expandedDirs,
	dirChildrenMap,
	dirLoadingMap,
	onToggleDir,
	onDragStartEntry
}) {
	const renderEntries = (entries, depth = 0) => {
		return entries.map(entry => {
			const isDir = entry.isDir;
			const isExpanded = isDir && expandedDirs?.has(entry.path);
			const children = (isDir && dirChildrenMap?.[entry.path]) || [];
			const isLoading = isDir && dirLoadingMap?.[entry.path];

			return (
				<div key={entry.path}>
					<div
						className='flex flex-row-reverse items-center gap-2 px-2 py-1.5 hover:bg-gray-100 rounded cursor-default group'
						style={{ paddingRight: 8 + depth * 12 }}
						title={entry.path}
						draggable
						onDragStart={e => onDragStartEntry?.(e, entry)}
						onClick={() => {
							if (isDir) onToggleDir?.(entry.path);
						}}
					>
						{isDir ? (
							<span className='text-gray-400'>
								{isExpanded ? (
									<ChevronDown className='h-3.5 w-3.5' />
								) : (
									<ChevronRight className='h-3.5 w-3.5 rotate-180' />
								)}
							</span>
						) : (
							<span className='w-3.5' />
						)}
						{isDir ? (
							<FolderIcon className='h-3.5 w-3.5 text-blue-400 shrink-0' />
						) : (
							<FileIcon className='h-3.5 w-3.5 text-gray-400 shrink-0' />
						)}
						<span
							className={`text-[11px] truncate flex-1 text-right ${
								isDir ? 'text-gray-700 font-medium' : 'text-gray-600'
							}`}
						>
							{entry.name}
						</span>
						{isDir && isLoading && (
							<RefreshCw className='h-3 w-3 text-gray-300 animate-spin mr-auto' />
						)}
					</div>
					{isDir && isExpanded && children?.length > 0 && (
						<div>{renderEntries(children, depth + 1)}</div>
					)}
					{isDir && isExpanded && !isLoading && children?.length === 0 && (
						<div
							className='text-[10px] text-gray-400 py-1 text-right'
							style={{ paddingRight: 8 + (depth + 1) * 12 }}
						>
							空目录
						</div>
					)}
				</div>
			);
		});
	};

	return (
		<aside className='border-l border-gray-200 bg-white flex flex-col min-h-0'>
			<div className='p-3 border-b border-gray-100 flex flex-row-reverse items-center justify-between h-[52px]'>
				<div className='text-xs font-semibold text-gray-600 flex flex-row-reverse items-center gap-1.5'>
					<FolderOpen className='h-3.5 w-3.5 text-gray-500' />
					文件列表
				</div>
				<div className='flex flex-row-reverse items-center gap-2'>
					{workspacePath && (
						<div className='text-[10px] text-gray-400'>
							{files.length} items
						</div>
					)}
					<Button
						variant='ghost'
						size='icon'
						className='h-6 w-6'
						onClick={onRefresh}
						disabled={filesLoading || !workspacePath}
					>
						<RefreshCw
							className={`h-3.5 w-3.5 ${filesLoading ? 'animate-spin' : ''}`}
						/>
					</Button>
				</div>
			</div>
			<ScrollArea className='flex-1'>
				<div className='p-2 space-y-0.5'>
					{filesLoading ? (
						<div className='text-xs text-gray-400 text-center py-4'>
							加载中...
						</div>
					) : files.length > 0 ? (
						renderEntries(files)
					) : (
						<div className='text-xs text-gray-400 text-center py-8 px-4'>
							{workspacePath ? '空目录' : '请先选择工作目录'}
						</div>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
