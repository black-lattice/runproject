import { useEffect, useState } from 'react';
import { Box, Package, Check, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
	Popover,
	PopoverTrigger,
	PopoverContent
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ProjectItem({
	project,
	selectedProject,
	onProjectSelect,
	tags = [],
	onSetTags
}) {
	const isSelected = selectedProject?.path === project.path; // 使用 path 比较更安全
	const [tagEditorOpen, setTagEditorOpen] = useState(false);
	const [tagDraft, setTagDraft] = useState('');

	useEffect(() => {
		if (tagEditorOpen) {
			setTagDraft((tags || []).join(', '));
		}
	}, [tagEditorOpen, tags]);

	const handleSaveTags = event => {
		event.stopPropagation();
		const normalized = tagDraft
			.split(/[,，]/)
			.map(tag => tag.trim())
			.filter(Boolean);
		onSetTags?.(project.path, normalized);
		setTagEditorOpen(false);
	};

	return (
		<div
			className={cn(
				'group flex flex-col gap-1 px-2 py-2 rounded-md cursor-pointer transition-all duration-200 border border-transparent select-none relative',
				isSelected
					? 'bg-blue-50/80 text-blue-700'
					: 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
			)}
			onClick={event => {
				if (event.target.closest('[data-no-select="true"]')) {
					return;
				}
				onProjectSelect(project);
			}}>

			{/* 选中指示条 */}
			{isSelected && (
				<div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />
			)}

			<div className="flex items-center gap-2.5 min-w-0">
				<div className={cn(
					"p-1 rounded-md transition-colors flex-shrink-0",
					isSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500 group-hover:bg-white group-hover:shadow-sm"
				)}>
					<Box className="w-4 h-4" />
				</div>

				<div className="flex-1 min-w-0 flex flex-col">
					<span className={cn(
						"font-medium text-sm truncate leading-tight",
						isSelected ? "text-blue-900" : "text-gray-700"
					)}>
						{project.name}
					</span>

					{/* 辅助信息行 */}
					<div className="flex items-center gap-2 mt-0.5 h-4">
						{project.packageManager && (
							<div className="flex items-center gap-1 text-[10px] opacity-70">
								<Package className="w-3 h-3" />
								<span>{project.packageManager}</span>
							</div>
						)}
						{project.nodeVersion && (
							<div className="flex items-center gap-1 text-[10px] opacity-70">
								<div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
								<span>{project.nodeVersion}</span>
							</div>
						)}
					</div>
					{tags.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-1">
							{tags.map(tag => (
								<Badge
									key={tag}
									variant="secondary"
									className="text-[10px] px-1.5 py-0.5">
									{tag}
								</Badge>
							))}
						</div>
					)}
				</div>

				<Popover
					open={tagEditorOpen}
					onOpenChange={open => setTagEditorOpen(open)}>
					<PopoverTrigger>
						<Button
							variant='ghost'
							size='icon'
							className='h-6 w-6 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity'
							data-no-select='true'
							title='编辑标签'>
							<Tag className='w-3 h-3' />
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						<div className='space-y-3'>
							<p className='text-sm text-gray-700'>项目标签（逗号分隔）</p>
							<Input
								value={tagDraft}
								onChange={event => setTagDraft(event.target.value)}
								placeholder='frontend, backend'
								className='h-8 text-xs'
							/>
							<div className='flex items-center gap-2 justify-end'>
								<Button
									variant='outline'
									size='sm'
									className='h-8 px-3'
									onClick={event => {
										event.stopPropagation();
										setTagEditorOpen(false);
									}}>
									取消
								</Button>
								<Button
									size='sm'
									className='h-8 px-3'
									onClick={handleSaveTags}>
									保存
								</Button>
							</div>
						</div>
					</PopoverContent>
				</Popover>

				{/* 选中状态打钩，或者其他指示 */}
				{/* {isSelected && <Check className="w-4 h-4 text-blue-500 opacity-50" />} */}
			</div>
		</div>
	);
}

export default ProjectItem;
