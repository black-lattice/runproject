import {
	ChevronRight,
	RefreshCw,
	Trash2,
	FolderOpen,
	Plus,
	Box
} from 'lucide-react';
import ProjectItem from './ProjectItem';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Popover,
	PopoverTrigger,
	PopoverContent
} from '@/components/ui/popover';
import { useState } from 'react';

function Sidebar({
	workspaces,
	selectedProject,
	isLoading,
	onAddWorkspace,
	onRefreshWorkspace,
	onRemoveWorkspace,
	onProjectSelect,
	onExecuteCommand,
	collapsedWorkspaces,
	onToggleCollapse
}) {
	const [deletePopoverOpen, setDeletePopoverOpen] = useState(null);
	return (
		<aside className='w-72 bg-white border-r border-gray-200 flex flex-col h-full shadow-lg z-10'>
			<div className='p-4 border-b border-gray-100 bg-gray-50/50 backdrop-blur-sm sticky top-0 z-20'>
				<div className='flex items-center justify-between mb-1'>
					<h3 className='text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2'>
						Workspaces
					</h3>
					<Button
						variant='ghost'
						size='icon'
						className='h-7 w-7 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors'
						onClick={onAddWorkspace}
						title='添加 Workspace'
					>
						<Plus className='w-4 h-4' />
					</Button>
				</div>
			</div>

			<ScrollArea className='flex-1 px-3 py-4'>
				{workspaces.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 text-center px-4'>
						<div className='w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-400'>
							<FolderOpen className='w-6 h-6' />
						</div>
						<p className='text-sm text-gray-500 mb-4'>
							还没有添加任何 workspace
						</p>
						<Button
							variant='outline'
							size='sm'
							className='text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
							onClick={onAddWorkspace}
						>
							<Plus className='w-3 h-3 mr-1.5' />
							添加项目
						</Button>
					</div>
				) : (
					<div className='space-y-4'>
						{workspaces.map((workspace, index) => (
							<div key={index} className='group'>
								{/* Workspace Header */}
								<div className='flex items-center gap-1 mb-1 px-2 group-hover:bg-gray-50/50 rounded-lg transition-colors py-1'>
									<button
										className='p-1 text-gray-400 hover:text-gray-600 transition-colors'
										onClick={() => onToggleCollapse(index)}
									>
										<ChevronRight
											className={`w-3.5 h-3.5 transition-transform duration-200 ${
												collapsedWorkspaces[index] ? '' : 'rotate-90'
											}`}
										/>
									</button>

									<div
										className='flex-1 min-w-0 font-medium text-sm text-gray-700 truncate cursor-pointer select-none'
										onClick={() => onToggleCollapse(index)}
										title={workspace.path}
									>
										{workspace.name}
									</div>

									<div className='flex items-center opacity-0 group-hover:opacity-100 transition-opacity'>
										<Button
											variant='ghost'
											size='icon'
											className='h-6 w-6 text-gray-400 hover:text-blue-600'
											onClick={e => {
												e.stopPropagation();
												onRefreshWorkspace(index);
											}}
											disabled={isLoading}
											title='刷新'
										>
											<RefreshCw
												className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
											/>
										</Button>
										<Popover
											open={deletePopoverOpen === index}
											onOpenChange={open =>
												setDeletePopoverOpen(open ? index : null)
											}
										>
											<PopoverTrigger>
												<Button
													variant='ghost'
													size='icon'
													className='h-6 w-6 text-gray-400 hover:text-red-600'
													disabled={isLoading}
													title='删除'
												>
													<Trash2 className='w-3 h-3' />
												</Button>
											</PopoverTrigger>
											<PopoverContent>
												<div className='space-y-3'>
													<p className='text-sm text-gray-700'>
														确定要删除 workspace{' '}
														<strong>"{workspace.name}"</strong> 吗？
													</p>
													<div className='flex items-center gap-2 justify-end'>
														<Button
															variant='outline'
															size='sm'
															className='h-8 px-3'
															onClick={e => {
																e.stopPropagation();
																setDeletePopoverOpen(null);
															}}
														>
															取消
														</Button>
														<Button
															variant='destructive'
															size='sm'
															className='h-8 px-3'
															onClick={e => {
																e.stopPropagation();
																setDeletePopoverOpen(null);
																onRemoveWorkspace(index);
															}}
														>
															删除
														</Button>
													</div>
												</div>
											</PopoverContent>
										</Popover>
									</div>
								</div>

								{/* Projects List */}
								<div
									className={`space-y-0.5 ml-2 pl-3 transition-all duration-300 ease-in-out overflow-hidden ${
										collapsedWorkspaces[index]
											? 'max-h-0 opacity-0'
											: 'max-h-[2000px] opacity-100'
									}`}
								>
									{workspace.projects?.length === 0 ? (
										<div className='py-2 px-3 text-xs text-gray-400 italic'>
											空文件夹
										</div>
									) : (
										workspace.projects?.map((project, projectIndex) => (
											<ProjectItem
												key={projectIndex}
												project={project}
												selectedProject={selectedProject}
												onProjectSelect={onProjectSelect}
											/>
										))
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</ScrollArea>
		</aside>
	);
}

export default Sidebar;
