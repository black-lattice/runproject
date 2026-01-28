import { Bot, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAgentStore } from '@/store/useAgentStore';

export function SessionSidebar({ onNewSession }) {
	const { sessions, activeSessionId, setActiveSession } = useAgentStore();

	return (
		<aside className='border-r border-gray-200 bg-white flex flex-col'>
			<div className='p-4 border-b border-gray-100'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
						<Bot className='h-4 w-4 text-emerald-600' />
						Agent 会话
					</div>
					<Button
						size='sm'
						variant='ghost'
						className='h-8 w-8 p-0'
						onClick={onNewSession}
					>
						<PlusCircle className='h-4 w-4' />
					</Button>
				</div>
			</div>

			<ScrollArea className='flex-1'>
				<div className='p-3 space-y-2'>
					{sessions.map(session => (
						<div
							key={session.id}
							className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
								session.id === activeSessionId
									? 'border-emerald-300 bg-emerald-50'
									: 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/50'
							}`}
							onClick={() => setActiveSession(session.id)}
						>
							<div className='flex items-center justify-between'>
								<span className='font-medium text-gray-700 truncate'>
									{session.title}
								</span>
								<Badge variant='outline' className='text-[10px]'>
									{session.status || 'idle'}
								</Badge>
							</div>
							<p className='text-[11px] text-gray-500 mt-1 truncate'>
								{session.workspace}
							</p>
						</div>
					))}
					{sessions.length === 0 && (
						<div className='text-xs text-gray-400 text-center py-8'>
							还没有 Agent 会话，请先选择目录并发送消息
						</div>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
