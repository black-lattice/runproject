import { FolderOpen, RefreshCw, Folder as FolderIcon, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function FileSidebar({ files, filesLoading, workspacePath, onRefresh }) {
	return (
		<aside className='border-l border-gray-200 bg-white flex flex-col min-h-0'>
			<div className='p-3 border-b border-gray-100 flex items-center justify-between h-[52px]'>
				<div className='text-xs font-semibold text-gray-600 flex items-center gap-1.5'>
					<FolderOpen className='h-3.5 w-3.5 text-gray-500' />
					文件列表
				</div>
				<div className='flex items-center gap-2'>
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
						files.map((file, index) => (
							<div
								key={index}
								className='flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 rounded cursor-default group'
								title={file.path}
							>
								{file.isDir ? (
									<FolderIcon className='h-3.5 w-3.5 text-blue-400 shrink-0' />
								) : (
									<FileIcon className='h-3.5 w-3.5 text-gray-400 shrink-0' />
								)}
								<span
									className={`text-[11px] truncate ${file.isDir ? 'text-gray-700 font-medium' : 'text-gray-600'}`}
								>
									{file.name}
								</span>
							</div>
						))
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
