import {
	ChevronRight,
	RefreshCw,
	Trash2,
	FolderOpen,
	Plus,
	Tag
} from 'lucide-react';
import ProjectItem from './ProjectItem';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
	Popover,
	PopoverTrigger,
	PopoverContent
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

function Sidebar({
	workspaces,
	selectedProject,
	isLoading,
	refreshingWorkspacePaths,
	onAddWorkspace,
	onRefreshWorkspace,
	onRemoveWorkspace,
	onProjectSelect,
	onExecuteCommand,
	collapsedWorkspaces,
	onToggleCollapse,
	workspaceTags,
	onSetWorkspaceTags,
	projectTags,
	onSetProjectTags
}) {
	const [deletePopoverOpen, setDeletePopoverOpen] = useState(null);
	const [tagEditorOpen, setTagEditorOpen] = useState(null);
	const [tagDrafts, setTagDrafts] = useState({});
	const getWorkspaceTags = workspace => workspaceTags?.[workspace.path] || [];
	const getProjectTags = project => projectTags?.[project.path] || [];

	const groupProjectsByTag = projects => {
		const groups = new Map();

		for (const project of projects) {
			const tags = getProjectTags(project);
			const primaryTag = tags[0] || '未分类';
			if (!groups.has(primaryTag)) {
				groups.set(primaryTag, new Map());
			}
			groups.get(primaryTag).set(project.path, project);
		}

		const tagKeys = Array.from(groups.keys()).sort((a, b) => {
			if (a === '未分类') return 1;
			if (b === '未分类') return -1;
			return a.localeCompare(b);
		});

		return tagKeys.map(tag => ({
			tag,
			projects: Array.from(groups.get(tag).values())
		}));
	};

	const handleTagSave = workspace => {
		const draft = tagDrafts[workspace.path] || '';
		const tags = draft
			.split(/[,，]/)
			.map(tag => tag.trim())
			.filter(Boolean);
		onSetWorkspaceTags(workspace.path, tags);
		setTagEditorOpen(null);
	};

	return (
		<aside className='app-sidebar project-sidebar border-r flex flex-col h-full z-10'>
			<div className='project-sidebar-header'>
				<h3 className='project-sidebar-title'>工作区</h3>
				<Button
					variant='ghost'
					size='icon'
					className='project-sidebar-icon-button text-muted-foreground hover:text-primary hover:bg-accent'
					onClick={onAddWorkspace}
					title='添加工作区'
					aria-label='添加工作区'>
					<Plus className='w-4 h-4' />
				</Button>
			</div>

			<ScrollArea className='project-sidebar-scroll flex-1'>
				{workspaces.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-12 text-center px-4'>
						<div className='w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3 text-muted-foreground'>
							<FolderOpen className='w-6 h-6' />
						</div>
						<p className='text-sm text-muted-foreground mb-4'>还没有添加工作区</p>
						<Button
							variant='outline'
							size='sm'
							className='text-primary border-primary/25 hover:bg-accent hover:border-primary/25'
							onClick={onAddWorkspace}>
							<Plus className='w-3 h-3 mr-1.5' />
							添加工作区
						</Button>
					</div>
				) : (
					<div className='project-sidebar-workspaces'>
						{workspaces.map((workspace, index) => {
							const isWorkspaceRefreshing = Boolean(
								refreshingWorkspacePaths?.[workspace.path]
							);
							return (
								<div key={workspace.path || index} className='project-workspace'>
									{/* Workspace Header */}
									<div className='project-workspace-header'>
										<button
											type='button'
											className='project-workspace-toggle text-muted-foreground hover:text-foreground'
											onClick={() => onToggleCollapse(index)}
											aria-expanded={!collapsedWorkspaces[index]}
											aria-label={`${collapsedWorkspaces[index] ? '展开' : '收起'}工作区 ${workspace.name}`}>
											<ChevronRight
												className={`w-3.5 h-3.5 transition-transform duration-200 ${
													collapsedWorkspaces[index] ? '' : 'rotate-90'
												}`}
											/>
										</button>

										<button
											type='button'
											className='project-workspace-name text-foreground'
											onClick={() => onToggleCollapse(index)}
											title={workspace.path}>
											{workspace.name}
										</button>

										<div className='project-workspace-actions'>
											<Button
												variant='ghost'
												size='icon'
												className='project-sidebar-icon-button text-muted-foreground hover:text-primary'
												onClick={e => {
													e.stopPropagation();
													onRefreshWorkspace(index);
												}}
												disabled={isWorkspaceRefreshing}
												title='刷新'
												aria-label={`刷新工作区 ${workspace.name}`}>
												<RefreshCw
													className={`w-3 h-3 ${isWorkspaceRefreshing ? 'animate-spin' : ''}`}
												/>
											</Button>
											<Popover
												open={deletePopoverOpen === index}
												onOpenChange={open =>
													setDeletePopoverOpen(open ? index : null)
												}>
												<PopoverTrigger>
													<Button
														variant='ghost'
														size='icon'
														className='project-sidebar-icon-button text-muted-foreground hover:text-destructive'
														disabled={isLoading}
														title='删除'
														aria-label={`删除工作区 ${workspace.name}`}>
														<Trash2 className='w-3 h-3' />
													</Button>
												</PopoverTrigger>
												<PopoverContent>
													<div className='space-y-3'>
														<p className='text-sm text-foreground'>
															确定要删除工作区{' '}
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
																}}>
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
																}}>
																删除
															</Button>
														</div>
													</div>
												</PopoverContent>
											</Popover>
											<Popover
												open={tagEditorOpen === workspace.path}
												onOpenChange={open => {
													setTagEditorOpen(open ? workspace.path : null);
													if (open) {
														setTagDrafts(prev => ({
															...prev,
															[workspace.path]:
																getWorkspaceTags(workspace).join(', ')
														}));
													}
												}}>
												<PopoverTrigger>
													<Button
														variant='ghost'
														size='icon'
														className='project-sidebar-icon-button text-muted-foreground hover:text-primary'
														title='编辑标签'
														aria-label={`编辑工作区 ${workspace.name} 的标签`}>
														<Tag className='w-3 h-3' />
													</Button>
												</PopoverTrigger>
												<PopoverContent>
													<div className='space-y-3'>
														<p className='text-sm text-foreground'>
															编辑标签（用逗号分隔）
														</p>
														<Input
															value={tagDrafts[workspace.path] || ''}
															onChange={event =>
																setTagDrafts(prev => ({
																	...prev,
																	[workspace.path]: event.target.value
																}))
															}
															placeholder='frontend, backend'
															className='h-8 text-xs'
														/>
														<div className='flex items-center gap-2 justify-end'>
															<Button
																variant='outline'
																size='sm'
																className='h-8 px-3'
																onClick={e => {
																	e.stopPropagation();
																	setTagEditorOpen(null);
																}}>
																取消
															</Button>
															<Button
																size='sm'
																className='h-8 px-3'
																onClick={e => {
																	e.stopPropagation();
																	handleTagSave(workspace);
																}}>
																保存
															</Button>
														</div>
													</div>
												</PopoverContent>
											</Popover>
										</div>
									</div>

									{getWorkspaceTags(workspace).length > 0 && (
										<div className='project-workspace-tags'>
											{getWorkspaceTags(workspace).map(tag => (
												<Badge
													key={tag}
													variant='secondary'
													className='text-xs px-1.5 py-0.5'>
													{tag}
												</Badge>
											))}
										</div>
									)}
									{/* Projects List */}
									<div
										className={`project-workspace-projects transition-all duration-300 ease-in-out ${
											collapsedWorkspaces[index]
												? 'max-h-0 opacity-0 overflow-hidden'
												: 'max-h-none opacity-100 overflow-visible'
										}`}>
										{(workspace.projects || []).length === 0 ? (
											<div className='py-2 px-3 text-xs text-muted-foreground italic'>
												空文件夹
											</div>
										) : (
											groupProjectsByTag(workspace.projects || []).map(
												group => (
													<div key={group.tag} className='project-tag-group'>
														<div className='project-tag-heading text-muted-foreground'>
															<span>{group.tag}</span>
															<span className='text-xs text-muted-foreground'>
																{group.projects.length}
															</span>
														</div>
														<div className='space-y-0.5'>
															{group.projects.map(project => (
																<ProjectItem
																	key={project.path}
																	project={project}
																	selectedProject={selectedProject}
																	onProjectSelect={onProjectSelect}
																	tags={getProjectTags(project)}
																	onSetTags={onSetProjectTags}
																/>
															))}
														</div>
													</div>
												)
											)
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</ScrollArea>
		</aside>
	);
}

export default Sidebar;
