import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';

function CommandCard({
	command,
	project,
	running,
	onExecuteCommand,
	onStopCommand
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Card
						className={`group relative overflow-hidden transition-all duration-200 hover:shadow-md border-transparent hover:border-gray-200 ${running
							? 'bg-blue-50/50 ring-2 ring-blue-500 ring-offset-2'
							: 'bg-white hover:-translate-y-1'
							}`}>
						<CardContent className='p-4'>
							<div className='flex justify-between items-start gap-3 mb-3'>
								<div className='min-w-0 flex-1'>
									<h4 className='font-bold text-gray-800 truncate mb-1 group-hover:text-blue-600 transition-colors'>
										{command.name}
									</h4>
									<code className='text-xs text-gray-400 block truncate font-mono bg-gray-50 px-1.5 py-0.5 rounded'>
										{command.script}
									</code>
								</div>
								<div
									className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${running
										? 'bg-green-500 animate-pulse'
										: 'bg-gray-200'
										}`}
								/>
							</div>

							<div className='flex items-center gap-2 mt-4'>
								<Button
									className={`flex-1 h-9 shadow-sm transition-all duration-200 ${running
										? 'bg-red-500 hover:bg-red-600 text-white'
										: 'bg-gray-900 hover:bg-blue-600 text-white'
										}`}
									onClick={e => {
										e.stopPropagation();
										if (running) {
											onStopCommand();
										} else {
											onExecuteCommand(project, command);
										}
									}}>
									{running ? (
										<>
											<Square className='w-4 h-4 mr-2 fill-current' />
											Stop
										</>
									) : (
										<>
											<Play className='w-4 h-4 mr-2 fill-current' />
											Run
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>
				</TooltipTrigger>
				<TooltipContent
					side='bottom'
					className='max-w-md'>
					<p className='font-mono text-xs'>{command.script}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default CommandCard;
