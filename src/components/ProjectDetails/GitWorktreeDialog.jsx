import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';
import { FolderOpen, Trash2, Plus, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const EDITOR_ICONS = {
	trae: '/src/assets/icons/www.trae.ai.ico',
	cursor: '/src/assets/icons/cursor.com.ico'
};

function GitWorktreeDialog({
	isOpen,
	onClose,
	worktrees,
	branches,
	onCreateWorktree,
	onRemoveWorktree,
	onOpenWorktree,
	selectedEditor,
	availableEditors,
	project
}) {
	const [selectedBranch, setSelectedBranch] = useState('');
	const [worktreeName, setWorktreeName] = useState('');

	if (!isOpen) return null;

	const handleBranchChange = branchName => {
		setSelectedBranch(branchName);
		const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9-]/g, '-');
		setWorktreeName(`${sanitizedBranchName}-worktree`);
	};

	const handleCreate = () => {
		if (selectedBranch && worktreeName) {
			onCreateWorktree(selectedBranch, worktreeName);
			setSelectedBranch('');
			setWorktreeName('');
		}
	};

	const handleOpenInEditor = async (worktreePath, editorId) => {
		const editor = availableEditors.find(e => e.id === editorId);
		if (!editor) return;

		try {
			await invoke('open_project_in_editor', {
				editorId: editorId,
				projectPath: worktreePath
			});
		} catch (error) {
			console.error('打开项目失败:', error);
		}
	};

	const installedEditors = availableEditors
		.filter(e => e.installed)
		.filter(e => e.id === 'trae' || e.id === 'cursor');

	const worktreeBranches = worktrees.map(w => w.branch);
	const availableBranches = branches.filter(
		b => !worktreeBranches.includes(b.name)
	);

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
			<div className='bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col'>
				<div className='flex items-center justify-between p-6 border-b'>
					<div>
						<h2 className='text-xl font-bold text-gray-900'>
							Git Worktree 管理
						</h2>
						<p className='text-sm text-gray-500 mt-1'>
							创建和管理多个工作目录，同时操作不同分支
						</p>
					</div>
					<Button
						variant='ghost'
						size='sm'
						onClick={onClose}>
						<X className='w-5 h-5' />
					</Button>
				</div>

				<div className='flex-1 overflow-y-auto p-6 space-y-6'>
					<div className='space-y-3'>
						<h3 className='font-semibold text-sm text-gray-900'>
							创建新 Worktree
						</h3>
						<div className='flex gap-2'>
							<Select
								value={selectedBranch}
								onValueChange={handleBranchChange}>
								<SelectTrigger className='flex-1'>
									<SelectValue placeholder='选择分支' />
								</SelectTrigger>
								<SelectContent>
									{availableBranches.map(branch => (
										<SelectItem
											key={branch.name}
											value={branch.name}>
											{branch.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								placeholder='Worktree 名称 (自动生成)'
								value={worktreeName}
								onChange={e => setWorktreeName(e.target.value)}
								className='flex-1'
							/>
							<Button
								onClick={handleCreate}
								disabled={!selectedBranch || !worktreeName}>
								<Plus className='w-4 h-4 mr-2' />
								创建
							</Button>
						</div>
					</div>

					<div className='space-y-3'>
						<h3 className='font-semibold text-sm text-gray-900'>
							现有 Worktree
						</h3>
						<div className='space-y-2 max-h-96 overflow-y-auto'>
							{worktrees.map(worktree => (
								<div
									key={worktree.path}
									className='flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200'>
									<div className='flex-1 min-w-0 mr-4'>
										<div className='flex items-center gap-2 mb-2'>
											<span className='font-medium text-sm text-gray-900'>
												{worktree.is_main
													? '🏠 主目录'
													: '📁 Worktree'}
											</span>
											{worktree.is_main && (
												<span className='text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full'>
													当前
												</span>
											)}
										</div>
										<div className='text-xs text-gray-500 space-y-1'>
											<div className='font-mono break-all whitespace-normal'>
												{worktree.path}
											</div>
											<div>
												分支:{' '}
												<span className='font-medium text-gray-700'>
													{worktree.branch}
												</span>
												{worktree.is_detached && (
													<span className='text-orange-600 ml-2'>
														(分离 HEAD)
													</span>
												)}
											</div>
										</div>
									</div>
									<div className='flex gap-2 flex-shrink-0'>
										{installedEditors.length > 0 && (
											<div className='flex gap-1'>
												{installedEditors.map(
													editor => {
														const iconPath =
															EDITOR_ICONS[
																editor.id
															];
														return (
															<TooltipProvider
																key={editor.id}>
																<Tooltip>
																	<TooltipTrigger
																		asChild>
																		<Button
																			size='sm'
																			variant='outline'
																			onClick={() =>
																				handleOpenInEditor(
																					worktree.path,
																					editor.id
																				)
																			}
																			title={`在 ${editor.name} 中打开`}>
																			<img
																				src={
																					iconPath
																				}
																				alt={
																					editor.name
																				}
																				className='w-4 h-4'
																			/>
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent>
																		<p>
																			在{' '}
																			{
																				editor.name
																			}{' '}
																			中打开
																		</p>
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														);
													}
												)}
											</div>
										)}
										<Button
											size='sm'
											variant='outline'
											onClick={() =>
												onOpenWorktree(worktree.path)
											}
											title='在文件管理器中打开'>
											<FolderOpen className='w-4 h-4' />
										</Button>
										{!worktree.is_main && (
											<Button
												size='sm'
												variant='outline'
												onClick={() =>
													onRemoveWorktree(
														worktree.path
													)
												}
												title='删除 Worktree'>
												<Trash2 className='w-4 h-4' />
											</Button>
										)}
									</div>
								</div>
							))}
							{worktrees.length === 0 && (
								<div className='text-center text-gray-400 text-sm py-8'>
									暂无 Worktree
								</div>
							)}
						</div>
					</div>
				</div>

				<div className='flex justify-end p-6 border-t bg-gray-50'>
					<Button
						variant='outline'
						onClick={onClose}>
						关闭
					</Button>
				</div>
			</div>
		</div>
	);
}

export default GitWorktreeDialog;
