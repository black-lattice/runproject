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
		<div className='flex items-center gap-3 p-3 bg-muted rounded-lg border border-border transition-colors hover:border-primary/25 hover:bg-accent/30 group'>
			<div className='p-2 bg-card rounded-md  text-primary group-hover:text-primary'>
				<GitBranch className='w-4 h-4' />
			</div>
			<div className='flex-1 min-w-0'>
				<label className='text-xs font-semibold text-muted-foreground  mb-0.5 block'>
					Git Branch
				</label>
				{isLoadingBranches ? (
					<div className='flex items-center gap-2 text-muted-foreground h-8'>
						<div className='w-3 h-3 border-2 border-border border-t-transparent rounded-full animate-spin'></div>
						<span className='text-xs'>Checking...</span>
					</div>
				) : branches.length > 0 ? (
					<Select
						value={currentBranch}
						onValueChange={onSwitchBranch}
						disabled={isLoadingBranches}>
						<SelectTrigger className='w-full h-8 border-none bg-transparent shadow-none p-0 focus:ring-0 text-sm font-medium text-foreground'>
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
					<span className='text-sm text-muted-foreground italic'>
						No Git Repo
					</span>
				)}
			</div>
			{branches.length > 0 && (
				<button
					onClick={onOpenWorktreeDialog}
					className='p-2 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-primary'
					title='管理 Worktree'>
					<Layers className='w-4 h-4' />
				</button>
			)}
		</div>
	);
}

export default GitBranchSelector;
