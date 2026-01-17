import { useEffect, useState } from 'react';
import { Play, Square, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';
import {
	Popover,
	PopoverTrigger,
	PopoverContent
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

function CommandCard({
	command,
	project,
	running,
	onExecuteCommand,
	onStopCommand,
	tags = [],
	onSetTags,
	commandKey
}) {
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
		onSetTags?.(commandKey, normalized);
		setTagEditorOpen(false);
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Card
						className={`group relative transition-all duration-200 hover:shadow-md border-transparent hover:border-gray-200 ${running
							? 'bg-blue-50/50 ring-2 ring-blue-500 ring-offset-2'
							: 'bg-white hover:-translate-y-1'
							} ${tagEditorOpen ? 'z-20' : 'z-0'}`}>
						<CardContent className='p-4'>
							<div className='flex justify-between items-start gap-3 mb-3'>
								<div className='min-w-0 flex-1'>
									<h4 className='font-bold text-gray-800 truncate mb-1 group-hover:text-blue-600 transition-colors'>
										{command.name}
									</h4>
									<code className='text-xs text-gray-400 block truncate font-mono bg-gray-50 px-1.5 py-0.5 rounded'>
										{command.script}
									</code>
									{tags.length > 0 && (
										<div className='mt-2 flex flex-wrap gap-1'>
											{tags.map(tag => (
												<Badge
													key={tag}
													variant='secondary'
													className='text-[10px] px-1.5 py-0.5'>
													{tag}
												</Badge>
											))}
										</div>
									)}
								</div>
								<div
									className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${running
										? 'bg-green-500 animate-pulse'
										: 'bg-gray-200'
										}`}
								/>
							</div>

							<div className='flex items-center gap-2 mt-4'>
								<Popover
									open={tagEditorOpen}
									onOpenChange={open => setTagEditorOpen(open)}>
									<PopoverTrigger>
										<Button
											variant='outline'
											size='icon'
											className='h-9 w-9 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity'
											data-no-select='true'
											title='编辑标签'>
											<Tag className='w-4 h-4' />
										</Button>
									</PopoverTrigger>
									<PopoverContent>
										<div className='space-y-3'>
											<p className='text-sm text-gray-700'>
												命令标签（逗号分隔）
											</p>
											<Input
												value={tagDraft}
												onChange={event => setTagDraft(event.target.value)}
												placeholder='dev, build'
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
