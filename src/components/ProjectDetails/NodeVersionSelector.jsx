import { Code2, Download } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';

function NodeVersionSelector({
	project,
	selectedNodeVersion,
	installedVersions,
	isLoadingVersions,
	onVersionChange,
	onInstallNode,
	isNodeInstalled
}) {
	return (
		<div className='flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors hover:border-blue-200 hover:bg-blue-50/30 group'>
			<div className='p-2 bg-white rounded-md shadow-sm text-green-600 group-hover:text-green-700'>
				<Code2 className='w-4 h-4' />
			</div>
			<div className='flex-1 min-w-0 flex items-center gap-2'>
				<div className="flex-1 min-w-0">
					<label className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5 block'>
						Node Version
					</label>
					{isLoadingVersions ? (
						<div className='flex items-center gap-2 text-gray-600 h-8'>
							<div className='w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin'></div>
							<span className='text-xs'>Checking...</span>
						</div>
					) : (
						<Select
							value={selectedNodeVersion}
							onValueChange={onVersionChange}>
							<SelectTrigger className='w-full h-8 border-none bg-transparent shadow-none p-0 focus:ring-0 text-sm font-medium text-gray-900'>
								<SelectValue
									placeholder={
										project.nodeVersion || 'System Default'
									}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='system'>System Default</SelectItem>
								{Array.isArray(installedVersions) &&
									[...new Set(installedVersions)].map(version => (
										<SelectItem key={version} value={version}>
											{version}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					)}
				</div>

				{!isNodeInstalled(selectedNodeVersion) && !isLoadingVersions && selectedNodeVersion !== 'system' && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8 text-blue-600 border-blue-200 hover:bg-blue-50 flex-shrink-0"
									onClick={onInstallNode}
								>
									<Download className="w-4 h-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>安装 Node.js {selectedNodeVersion}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>
		</div>
	);
}

export default NodeVersionSelector;
