import { Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandCard from './CommandCard';

function CommandList({
	project,
	runningCommand,
	commands,
	onExecuteCommand,
	onStopCommand,
	commandTags,
	onSetCommandTags
}) {
	const isCommandRunning = command => {
		return (
			runningCommand &&
			runningCommand.project.name === project.name &&
			runningCommand.command.name === command.name
		);
	};

	const getCommandKey = command => `${project.path}::${command.name}`;

	const getCommandTags = command =>
		commandTags?.[getCommandKey(command)] || [];

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
			<div className='flex items-center justify-between'>
				<h3 className='text-lg font-bold text-gray-800 flex items-center gap-2'>
					<Terminal className='w-5 h-5 text-gray-500' />
					Scripts
					<Badge variant='secondary' className='ml-2 text-xs font-normal'>
						{commands.length}
					</Badge>
				</h3>
			</div>

			<div className='space-y-6'>
				{groupCommandsByTag(commands).map(group => (
					<div key={group.tag} className='space-y-3'>
						<div className='text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2'>
							<span>{group.tag}</span>
							<span className='text-[10px] text-gray-400'>
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
