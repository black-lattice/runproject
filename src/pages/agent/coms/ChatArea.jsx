import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Bot, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ChatArea({
	activeSession,
	messages,
	isSending,
	pendingAction,
	onApprove,
	rememberApproval,
	setRememberApproval
}) {
	return (
		<div className='flex-1 flex flex-col min-h-0'>
			<div className='flex flex-col flex-1 min-h-0'>
				<ScrollArea className='flex-1'>
					<div className='p-6 space-y-4'>
						{messages.map(message => {
							if (message.role === 'system') {
								const isError = /error|fail|中断|拒绝/i.test(message.content);
								return (
									<div
										key={message.id}
										className='flex justify-center my-2 px-4'
									>
										<span
											className={`text-[10px] px-3 py-1 rounded-full border max-w-full truncate ${ 
												isError
												? 'bg-amber-50 text-amber-600 border-amber-100'
												: 'bg-gray-50 text-gray-400 border-gray-100'
											}`}
										>
											{message.content}
										</span>
									</div>
								);
							}
							return (
								<div
									key={message.id}
									className={`rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${ 
										message.role === 'user'
											? 'bg-emerald-600 text-white ml-auto max-w-[85%]'
											: 'bg-white text-gray-700 border border-gray-100 max-w-[85%]'
									}`}
								>
									{message.reasoning && (
										<div className='mb-3 pb-3 border-b border-gray-100'>
											<div className='flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2'>
												<Bot className='h-3 w-3' />
												思考过程
											</div>
											<div className='text-gray-500 italic text-xs leading-normal bg-gray-50/50 rounded-lg p-3 border border-gray-50'>
												<ReactMarkdown>{message.reasoning}</ReactMarkdown>
											</div>
										</div>
									)}
									<ReactMarkdown
										components={{
											p: ({ children }) => (
												<p className='mb-2 last:mb-0'>{children}</p>
											),
											ul: ({ children }) => (
												<ul className='list-disc pl-5 mb-2'>{children}</ul>
											),
											ol: ({ children }) => (
												<ol className='list-decimal pl-5 mb-2'>{children}</ol>
											),
											li: ({ children }) => <li className='mb-1'>{children}</li>,
											h1: ({ children }) => (
												<h1 className='text-xl font-bold mb-2'>{children}</h1>
											),
											h2: ({ children }) => (
												<h2 className='text-lg font-bold mb-2'>{children}</h2>
											),
											h3: ({ children }) => (
												<h3 className='text-base font-bold mb-2'>{children}</h3>
											),
											code({ node, inline, className, children, ...props }) {
												const match = /language-(\w+)/.exec(className || '');
												return !inline && match ? (
													<SyntaxHighlighter
														style={vscDarkPlus}
														language={match[1]}
														PreTag='div'
														className='rounded-md my-2'
														{...props}
													>
														{String(children).replace(/\n$/, '')}
													</SyntaxHighlighter>
												) : (
													<code
														className={`px-1 py-0.5 rounded text-xs ${ 
															message.role === 'user'
																? 'bg-emerald-700 text-emerald-50'
															: 'bg-gray-100 text-gray-800'
														}`}
														{...props}
													>
														{children}
													</code>
												);
											}
										}}
										className='markdown-content'
									>
										{message.content}
									</ReactMarkdown>
								</div>
					);
						})}
						{messages.length === 0 && (
							<div className='text-sm text-gray-400'>
								请输入你的需求，Agent 会流式输出结果
						</div>
					)}
						{isSending &&
							messages.length > 0 &&
							messages[messages.length - 1].role === 'user' && (
								<div className='flex items-center gap-2 text-gray-400 text-xs px-4 py-2 animate-pulse'>
									<Bot className='h-3 w-3' />
									<span>Codex 正在思考...</span>
								</div>
							)}

						{pendingAction && (
							<div className='rounded-xl bg-white border border-amber-200 shadow-md p-3 mb-4 mx-auto max-w-[400px] sticky bottom-0 z-10'>
								<div className='flex items-center justify-between gap-4'>
									<div className='flex items-center gap-2 min-w-0'>
										<div className='h-7 w-7 rounded-full bg-amber-50 flex items-center justify-center shrink-0'>
											<ShieldCheck className='h-4 w-4 text-amber-600' />
										</div>
										<div className='text-xs font-medium text-gray-700 truncate'>
											权限确认请求
										</div>
									</div>
									<div className='flex items-center gap-2'>
										<Button
											size='sm'
											variant='ghost'
											onClick={() => onApprove('reject')}
											className='h-7 px-3 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50'
										>
											拒绝
										</Button>
										<Button
											size='sm'
											onClick={() => onApprove('approve')}
											className='h-7 px-4 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white border-0'
										>
											批准执行
										</Button>
									</div>
								</div>
						</div>
					)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}
