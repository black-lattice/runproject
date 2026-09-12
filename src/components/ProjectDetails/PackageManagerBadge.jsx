import { Package } from 'lucide-react';

function PackageManagerBadge({ project }) {
	return (
		<div className='flex items-center gap-3 p-3 bg-muted rounded-lg border border-border transition-colors hover:border-border hover:bg-muted group'>
			<div className='p-2 bg-card rounded-md  text-primary group-hover:text-primary'>
				<Package className='w-4 h-4' />
			</div>
			<div className='flex-1 min-w-0'>
				<label className='text-xs font-semibold text-muted-foreground  mb-0.5 block'>
					Package Manager
				</label>
				<span className='text-sm font-medium text-foreground capitalize'>
					{project.packageManager === 'yarn'
						? 'Yarn'
						: project.packageManager === 'pnpm'
							? 'pnpm'
							: 'npm'}
				</span>
			</div>
		</div>
	);
}

export default PackageManagerBadge;
