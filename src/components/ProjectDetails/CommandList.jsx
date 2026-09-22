import { useId, useRef, useState } from 'react';
import { Search, Terminal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CommandCard from './CommandCard';

function CommandList({
	project,
	runningCommands,
	commands,
	onExecuteCommand,
	onStopCommand,
	commandTags,
	onSetCommandTags
}) {
	const [query, setQuery] = useState('');
	const searchId = useId();
	const searchRef = useRef(null);
	const getCommandKey = command => `${project.path}::${command.name}`;
	const isCommandRunning = command =>
		Boolean(runningCommands?.[getCommandKey(command)]);

	const getCommandTags = command =>
		commandTags?.[getCommandKey(command)] || [];
	const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const filteredCommands = commands.filter(command => {
		const text = [command.name, command.script, ...getCommandTags(command)]
			.join(' ').toLowerCase();
		return keywords.every(keyword => text.includes(keyword));
	});
	const clearSearch = () => {
		setQuery('');
		searchRef.current?.focus();
	};

	const groupCommandsByTag = list => {
		const groups = new Map();

		for (const command of list) {
			const tags = getCommandTags(command);
			const primaryTag = tags[0] || '未分类';
			if (!groups.has(primaryTag)) {
				groups.set(primaryTag, []);
			}
			groups.get(primaryTag).push(command);
		}

		const tagKeys = Array.from(groups.keys()).sort((a, b) => {
			if (a === '未分类') return 1;
			if (b === '未分类') return -1;
			return a.localeCompare(b);
		});

		return tagKeys.map(tag => ({
			tag,
			commands: groups.get(tag)
		}));
	};

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center gap-3'>
				<h3 className='text-lg font-semibold text-foreground flex shrink-0 items-center gap-2'>
					<Terminal className='w-5 h-5 text-muted-foreground' />
					Scripts
					<Badge variant='secondary' className='ml-2 text-xs font-normal'>
						{commands.length}
					</Badge>
				</h3>
				<div className='relative w-[280px] max-w-full'>
					<label htmlFor={searchId} className='sr-only'>搜索命令</label>
					<Search aria-hidden='true' className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none' />
					<Input
						id={searchId}
						ref={searchRef}
						value={query}
						onChange={event => setQuery(event.target.value)}
						onKeyDown={event => {
							if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
								event.stopPropagation();
								clearSearch();
							}
						}}
						placeholder='搜索命令、内容或标签'
						title='多个关键词用空格分隔'
						className='h-8 pl-9 pr-9'
					/>
					{query && (
						<Button type='button' variant='ghost' size='icon' className='absolute right-0.5 top-0.5 h-7 w-7' aria-label='清空命令搜索' title='清空搜索（Esc）' onClick={clearSearch}>
							<X aria-hidden='true' className='w-4 h-4' />
						</Button>
					)}
				</div>
				<p role='status' className='text-xs text-muted-foreground shrink-0'>
					{keywords.length > 0 ? `${filteredCommands.length} / ${commands.length} 条` : ''}
				</p>
			</div>

			{filteredCommands.length === 0 && (
				<div className='rounded-lg border border-dashed border-border p-6 text-center space-y-2'>
					<p className='text-sm text-muted-foreground'>
						{commands.length ? '没有匹配的命令，试试更短的关键词或标签。' : '当前项目没有可运行的命令。'}
					</p>
					{query && <Button type='button' variant='outline' size='sm' onClick={clearSearch}>清空搜索</Button>}
				</div>
			)}

			<div className='space-y-6'>
				{groupCommandsByTag(filteredCommands).map(group => (
					<div key={group.tag} className='space-y-3'>
						<div className='text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2'>
							<span>{group.tag}</span>
							<span className='text-xs text-muted-foreground'>
								{group.commands.length}
							</span>
						</div>
						<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
							{group.commands.map(command => (
								<CommandCard
									key={command.name}
									command={command}
									project={project}
									running={isCommandRunning(command)}
									onExecuteCommand={onExecuteCommand}
									onStopCommand={onStopCommand}
									tags={getCommandTags(command)}
									onSetTags={onSetCommandTags}
									commandKey={getCommandKey(command)}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default CommandList;
