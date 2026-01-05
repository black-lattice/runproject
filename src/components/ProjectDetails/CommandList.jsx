import { Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandCard from './CommandCard';

function CommandList({
	project,
	runningCommand,
	commands,
	onExecuteCommand,
	onStopCommand
}) {
	const isCommandRunning = command => {
		return (
			runningCommand &&
			runningCommand.project.name === project.name &&
			runningCommand.command.name === command.name
		);
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

			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
				{commands.map((command, commandIndex) => (
					<CommandCard
						key={commandIndex}
						command={command}
						project={project}
						running={isCommandRunning(command)}
						onExecuteCommand={onExecuteCommand}
						onStopCommand={onStopCommand}
					/>
				))}
			</div>
		</div>
	);
}

export default CommandList;
