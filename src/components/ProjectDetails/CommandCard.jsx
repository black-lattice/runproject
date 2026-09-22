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
import { useToast } from '@/hooks/use-toast';

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
	const { toast } = useToast();

	const handleCopyCommand = async event => {
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(command.script);
			toast({ description: '完整命令已复制到剪贴板' });
		} catch (error) {
			toast({ title: '复制失败', description: String(error), variant: 'destructive' });
		}
	};

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
		<Card
			className={`group relative min-w-0 transition-colors duration-200 hover:border-primary/30 focus-within:border-primary/30 ${running
				? 'border-primary/30 bg-primary/5'
				: 'border-border bg-card'
				} ${tagEditorOpen ? 'z-20' : 'z-0'}`}>
			<CardContent className='p-3.5 space-y-3'>
				<div className='flex min-w-0 items-center gap-2'>
					<h4 className='flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold leading-5 text-foreground' title={command.name}>
						{running && <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-success' role='img' aria-label='运行中' />}
						<span className='truncate'>{command.name}</span>
					</h4>
					<div className={`flex shrink-0 items-center gap-1 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto ${tagEditorOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
						<Popover
							open={tagEditorOpen}
							onOpenChange={open => setTagEditorOpen(open)}>
							<PopoverTrigger>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5'
									data-no-select='true'
									aria-label={`编辑 ${command.name} 的标签`}
									title='编辑标签'>
									<Tag className='w-4 h-4' />
								</Button>
							</PopoverTrigger>
							<PopoverContent>
								<div className='space-y-3'>
									<p className='text-sm text-foreground'>
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
							type='button'
							variant='ghost'
							size='icon'
							className={`h-7 w-8 rounded-md [&_svg]:size-3.5 ${running
								? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground'
								: 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
								}`}
							aria-label={`${running ? '停止' : '运行'} ${command.name}`}
							title={running ? '运行中，点击停止' : '运行命令'}
							onClick={event => {
								event.stopPropagation();
								if (running) {
									onStopCommand(project, command);
								} else {
									onExecuteCommand(project, command);
								}
							}}>
							{running
								? <Square aria-hidden='true' className='fill-current' />
								: <Play aria-hidden='true' className='fill-current ml-0.5' />}
						</Button>
					</div>
				</div>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type='button'
								aria-label={`复制 ${command.name} 的完整命令`}
								onClick={handleCopyCommand}
								className='block w-full rounded-sm text-left text-muted-foreground hover:text-foreground cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
								<code
									className='block min-h-[36px] font-mono text-xs leading-[18px] break-all'
									style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
									{command.script}
								</code>
							</button>
						</TooltipTrigger>
						<TooltipContent side='bottom' collisionPadding={12} className='max-w-[min(28rem,calc(100vw-24px))]'>
							<button type='button' onClick={handleCopyCommand} aria-label={`复制 ${command.name} 的完整命令`} className='block w-full text-left cursor-default rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
								<code className='font-mono text-xs leading-5 whitespace-pre-wrap break-all'>{command.script}</code>
							</button>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				{tags.length > 0 && (
					<div className='flex flex-wrap gap-1 border-t border-border/60 pt-2'>
						{tags.map(tag => (
							<Badge key={tag} variant='secondary' className='max-w-full truncate rounded-md px-1.5 py-0 text-xs font-normal leading-5'>
								{tag}
							</Badge>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export default CommandCard;
