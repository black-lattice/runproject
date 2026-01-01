import { GitBranch, Layers } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';

function GitBranchSelector({
	branches,
	currentBranch,
	isLoadingBranches,
	onSwitchBranch,
	onOpenWorktreeDialog
}) {
	return (
		<div className='flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors hover:border-purple-200 hover:bg-purple-50/30 group'>
			<div className='p-2 bg-white rounded-md shadow-sm text-purple-600 group-hover:text-purple-700'>
				<GitBranch className='w-4 h-4' />
			</div>
			<div className='flex-1 min-w-0'>
				<label className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5 block'>
					Git Branch
				</label>
				{isLoadingBranches ? (
					<div className='flex items-center gap-2 text-gray-600 h-8'>
						<div className='w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin'></div>
						<span className='text-xs'>Checking...</span>
					</div>
				) : branches.length > 0 ? (
					<Select
						value={currentBranch}
						onValueChange={onSwitchBranch}
						disabled={isLoadingBranches}>
						<SelectTrigger className='w-full h-8 border-none bg-transparent shadow-none p-0 focus:ring-0 text-sm font-medium text-gray-900'>
							<SelectValue placeholder='Select Branch' />
						</SelectTrigger>
						<SelectContent>
							{branches.map(branch => (
								<SelectItem
									key={branch.name}
									value={branch.name}>
									{branch.name}{' '}
									{branch.is_current && '(Current)'}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<span className='text-sm text-gray-400 italic'>
						No Git Repo
					</span>
				)}
			</div>
			{branches.length > 0 && (
				<button
					onClick={onOpenWorktreeDialog}
					className='p-2 hover:bg-purple-100 rounded-md transition-colors text-gray-500 hover:text-purple-600'
					title='管理 Worktree'>
					<Layers className='w-4 h-4' />
				</button>
			)}
		</div>
	);
}

export default GitBranchSelector;
