import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';

function buildItems(workspaces, query) {
	const q = query.trim().toLowerCase();
	const items = [];

	for (const workspace of workspaces || []) {
		for (const project of workspace.projects || []) {
			const projectName = project.name?.toLowerCase() || '';
			const projectPath = project.path?.toLowerCase() || '';
			const projectMatch =
				!q || projectName.includes(q) || projectPath.includes(q);

			if (projectMatch) {
				items.push({
					id: `project:${project.path}`,
					type: 'project',
					project
				});
			}

			for (const command of project.commands || []) {
				const commandName = command.name?.toLowerCase() || '';
				const commandMatch =
					!q || commandName.includes(q) || projectName.includes(q);
				if (commandMatch) {
					items.push({
						id: `command:${project.path}:${command.name}`,
						type: 'command',
						project,
						command
					});
				}
			}
		}
	}

	return items.slice(0, 50);
}

function CommandPalette({
	open,
	onOpenChange,
	workspaces,
	onSelectProject,
	onRunCommand
}) {
	const [query, setQuery] = useState('');
	const [highlightIndex, setHighlightIndex] = useState(0);

	const items = useMemo(
		() => buildItems(workspaces, query),
		[workspaces, query]
	);

	useEffect(() => {
		if (open) {
			setQuery('');
			setHighlightIndex(0);
		}
	}, [open]);

	useEffect(() => {
		if (highlightIndex >= items.length) {
			setHighlightIndex(0);
		}
	}, [highlightIndex, items.length]);

	const handleSelect = item => {
		if (!item) return;
		if (item.type === 'project') {
			onSelectProject?.(item.project);
			onOpenChange(false);
			return;
		}
		if (item.type === 'command') {
			onSelectProject?.(item.project);
			onRunCommand?.(item.project, item.command);
			onOpenChange(false);
		}
	};

	const handleKeyDown = event => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setHighlightIndex(current =>
				Math.min(current + 1, items.length - 1)
			);
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setHighlightIndex(current => Math.max(current - 1, 0));
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSelect(items[highlightIndex]);
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-xl'>
				<DialogHeader>
					<DialogTitle className='flex items-center justify-between'>
						<span>快速搜索</span>
						<span className='text-xs text-gray-400'>Cmd/Ctrl+K</span>
					</DialogTitle>
				</DialogHeader>
				<div className='p-4 space-y-3'>
					<Input
						autoFocus
						placeholder='搜索项目或命令...'
						value={query}
						onChange={event => setQuery(event.target.value)}
						onKeyDown={handleKeyDown}
					/>
					<div className='max-h-96 overflow-auto rounded-md border border-gray-100'>
						{items.length === 0 ? (
							<div className='p-6 text-center text-sm text-gray-500'>
								没有匹配项
							</div>
						) : (
							<div className='divide-y'>
								{items.map((item, index) => {
									const isActive = index === highlightIndex;
									if (item.type === 'project') {
										return (
											<button
												key={item.id}
												type='button'
												className={cn(
													'w-full text-left px-4 py-3 text-sm transition-colors',
													isActive
														? 'bg-blue-50 text-blue-700'
														: 'hover:bg-gray-50 text-gray-700'
												)}
												onMouseEnter={() => setHighlightIndex(index)}
												onClick={() => handleSelect(item)}>
												<div className='font-medium'>{item.project.name}</div>
												<div className='text-xs text-gray-400 truncate'>
													{item.project.path}
												</div>
											</button>
										);
									}

									return (
										<button
											key={item.id}
											type='button'
											className={cn(
												'w-full text-left px-4 py-3 text-sm transition-colors',
												isActive
													? 'bg-blue-50 text-blue-700'
													: 'hover:bg-gray-50 text-gray-700'
											)}
											onMouseEnter={() => setHighlightIndex(index)}
											onClick={() => handleSelect(item)}>
											<div className='font-medium'>
												{item.command.name}
											</div>
											<div className='text-xs text-gray-400'>
												{item.project.name}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default CommandPalette;
