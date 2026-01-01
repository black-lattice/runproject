import { Package } from 'lucide-react';

function PackageManagerBadge({ project }) {
	return (
		<div className='flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors hover:border-orange-200 hover:bg-orange-50/30 group'>
			<div className='p-2 bg-white rounded-md shadow-sm text-orange-600 group-hover:text-orange-700'>
				<Package className='w-4 h-4' />
			</div>
			<div className='flex-1 min-w-0'>
				<label className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5 block'>
					Package Manager
				</label>
				<span className='text-sm font-medium text-gray-900 capitalize'>
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
