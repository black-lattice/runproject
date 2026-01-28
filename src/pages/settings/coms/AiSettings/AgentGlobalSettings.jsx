import { Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';

/**
 * AgentGlobalSettings component for customizing global Agent behavior.
 * @param {Object} props
 * @param {string} props.systemPrompt - Current system prompt value
 * @param {Function} props.onPromptChange - Callback when prompt text changes
 * @param {Function} props.onSave - Callback when save button is clicked
 */
export function AgentGlobalSettings({ systemPrompt, onPromptChange, onSave }) {
	return (
		<Card className='shadow-sm border-gray-200'>
			<CardHeader className='pb-4'>
				<div className='flex items-center justify-between'>
					<div>
						<CardTitle className='text-xl'>Agent 全局配置</CardTitle>
						<CardDescription className='mt-1'>
							自定义 Agent 的全局行为准则与提示词。
						</CardDescription>
					</div>
					<Button onClick={onSave} size='sm' className='gap-2 bg-emerald-600 hover:bg-emerald-700'>
						<Check className='w-4 h-4' /> 保存配置
					</Button>
				</div>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='space-y-3'>
					<Label className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
						<MessageSquare className='w-4 h-4 text-gray-400' />
						系统提示词 (System Prompt)
					</Label>
					<textarea
						value={systemPrompt}
						onChange={e => onPromptChange(e.target.value)}
						placeholder='例如：你是一个专业的程序员，擅长使用 React 和 Tailwind CSS...'
						className='flex min-h-[120px] w-full rounded-md border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all'
					/>
					<p className='text-[11px] text-gray-400 px-1'>
						该提示词将作为 AI 的最高指令，在每一轮对话开始时发送给模型。留空则不发送任何预设指令。
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
