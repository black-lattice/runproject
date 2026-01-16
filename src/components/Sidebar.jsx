import {
	ChevronRight,
	RefreshCw,
	Trash2,
	FolderOpen,
	Plus,
	Box,
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
	onAddWorkspace,
	onRefreshWorkspace,
	onRemoveWorkspace,
	onProjectSelect,
	onExecuteCommand,
	collapsedWorkspaces,
	onToggleCollapse,
	workspaceTags,
	onSetWorkspaceTags
}) {
	const [deletePopoverOpen, setDeletePopoverOpen] = useState(null);
	const [tagEditorOpen, setTagEditorOpen] = useState(null);
	const [tagDrafts, setTagDrafts] = useState({});
	const [searchQuery, setSearchQuery] = useState('');

	const parseSearch = query => {
		const tokens = query
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		const tagTokens = tokens
			.filter(token => token.startsWith('#'))
			.map(token => token.slice(1).toLowerCase());
		const textTokens = tokens
			.filter(token => !token.startsWith('#'))
			.map(token => token.toLowerCase());
		return { tagTokens, textTokens };
	};

	const getWorkspaceTags = workspace =>
		workspaceTags?.[workspace.path] || [];

	const allTags = Array.from(
		new Set(
			(workspaces || []).flatMap(workspace =>
				getWorkspaceTags(workspace)
			)
		)
	).sort();

	const { tagTokens, textTokens } = parseSearch(searchQuery);

	const updateQueryTags = nextTags => {
		const next = [];
		if (textTokens.length > 0) {
			next.push(textTokens.join(' '));
		}
		if (nextTags.length > 0) {
			next.push(nextTags.map(tag => `#${tag}`).join(' '));
		}
		setSearchQuery(next.join(' ').trim());
	};

	const toggleTagFilter = tag => {
		const normalized = tag.toLowerCase();
		const hasTag = tagTokens.includes(normalized);
		const nextTags = hasTag
			? tagTokens.filter(item => item !== normalized)
			: [...tagTokens, normalized];
		updateQueryTags(nextTags);
	};

	const matchesWorkspace = workspace => {
		if (!searchQuery.trim()) return true;
		const tags = getWorkspaceTags(workspace).map(tag => tag.toLowerCase());
		if (tagTokens.length > 0) {
			const hasAllTags = tagTokens.every(tag => tags.includes(tag));
			if (!hasAllTags) return false;
		}

		if (textTokens.length === 0) return true;

		const workspaceName = workspace.name?.toLowerCase() || '';
		const workspacePath = workspace.path?.toLowerCase() || '';
		const projectNames =
			workspace.projects?.map(project => project.name?.toLowerCase()) ||
			[];

		return textTokens.every(token => {
			if (workspaceName.includes(token)) return true;
			if (workspacePath.includes(token)) return true;
			return projectNames.some(name => name?.includes(token));
		});
	};

	const filteredWorkspaces = workspaces
		.map((workspace, index) => ({ workspace, index }))
		.filter(item => matchesWorkspace(item.workspace));

	const handleTagSave = workspace => {
		const draft = tagDrafts[workspace.path] || '';
		const tags = draft
			.split(',')
			.map(tag => tag.trim())
			.filter(Boolean);
		onSetWorkspaceTags(workspace.path, tags);
		setTagEditorOpen(null);
	};

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
				<div className='mt-2'>
					<Input
						value={searchQuery}
						onChange={event => setSearchQuery(event.target.value)}
						placeholder='搜索工作区/项目，#标签'
						className='h-8 text-xs'
					/>
				</div>
				{allTags.length > 0 && (
					<div className='mt-2 flex flex-wrap gap-1'>
						{allTags.map(tag => {
							const active = tagTokens.includes(tag.toLowerCase());
							return (
								<button
									key={tag}
									type='button'
									onClick={() => toggleTagFilter(tag)}
									className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
										active
											? 'bg-blue-600 text-white border-blue-600'
											: 'bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
									}`}>
									#{tag}
								</button>
							);
						})}
					</div>
				)}
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
				) : filteredWorkspaces.length === 0 ? (
					<div className='flex flex-col items-center justify-center py-10 text-center px-4'>
						<p className='text-sm text-gray-500'>未找到匹配的工作区</p>
					</div>
				) : (
					<div className='space-y-4'>
						{filteredWorkspaces.map(({ workspace, index }) => (
							<div key={workspace.path || index} className='group'>
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

									<div className='flex flex-wrap items-center gap-1'>
										{getWorkspaceTags(workspace).map(tag => (
											<Badge
												key={tag}
												variant='secondary'
												className='text-[10px] px-1.5 py-0.5'>
												{tag}
											</Badge>
										))}
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
										<Popover
											open={tagEditorOpen === workspace.path}
											onOpenChange={open => {
												setTagEditorOpen(open ? workspace.path : null);
												if (open) {
													setTagDrafts(prev => ({
														...prev,
														[workspace.path]: getWorkspaceTags(
															workspace
														).join(', ')
													}));
												}
											}}>
											<PopoverTrigger>
												<Button
													variant='ghost'
													size='icon'
													className='h-6 w-6 text-gray-400 hover:text-blue-600'
													title='编辑标签'>
													<Tag className='w-3 h-3' />
												</Button>
											</PopoverTrigger>
											<PopoverContent>
												<div className='space-y-3'>
													<p className='text-sm text-gray-700'>
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
