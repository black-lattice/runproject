import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

function DebugInfoPanel({ project, sortedCommands }) {
	return (
		<Alert className='mb-6 bg-yellow-50/50 border-yellow-200'>
			<AlertDescription className='text-sm text-yellow-800 font-mono space-y-1'>
				<div className='font-bold mb-2 flex items-center gap-2'>
					<Info className='w-4 h-4' /> Debug Info
				</div>
				<div>Cache Version: {project._cacheVersion || 'N/A'}</div>
				<div>Cache Time: {project._cacheTimestamp || 'N/A'}</div>
				<div>Commands Count: {sortedCommands.length}</div>
			</AlertDescription>
		</Alert>
	);
}

export default DebugInfoPanel;
