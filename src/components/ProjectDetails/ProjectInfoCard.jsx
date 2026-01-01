import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Folder, RefreshCw, Settings, Info } from 'lucide-react';
import DebugInfoPanel from './DebugInfoPanel';
import GitBranchSelector from './GitBranchSelector';
import NodeVersionSelector from './NodeVersionSelector';
import PackageManagerBadge from './PackageManagerBadge';
import EditorSelector from './EditorSelector';

function ProjectInfoCard({
	project,
	showDebugInfo,
	onToggleDebugInfo,
	branches,
	currentBranch,
	isLoadingBranches,
	onSwitchBranch,
	onRefreshBranches,
	selectedNodeVersion,
	installedVersions,
	isLoadingVersions,
	onVersionChange,
	onInstallNode,
	isNodeInstalled,
	selectedEditor,
	availableEditors,
	isLoadingEditors,
	onEditorChange,
	onRefreshEditors
}) {
	return (
		<Card className='border-none shadow-sm bg-white/80 backdrop-blur-sm'>
			<CardContent className='p-6'>
				<div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6'>
					<div className='flex items-center gap-3'>
						<div className='p-3 bg-blue-100 text-blue-600 rounded-xl'>
							<Package className='w-6 h-6' />
						</div>
						<div>
							<h2 className='text-2xl font-bold text-gray-800 tracking-tight'>
								{project.name}
							</h2>
							<div className='flex items-center gap-2 text-gray-500 text-sm mt-1'>
								<Folder className='w-3.5 h-3.5' />
								<span className='truncate max-w-[300px] font-mono'>
									{project.path}
								</span>
							</div>
						</div>
					</div>
					<div className='flex gap-2'>
						<Button
							variant='ghost'
							size='sm'
							className='text-gray-500 hover:text-gray-700 hover:bg-gray-100'
							onClick={onRefreshBranches}
							title='刷新 Git 分支'>
							<RefreshCw
								className={`w-4 h-4 mr-2 ${isLoadingBranches ? 'animate-spin' : ''}`}
							/>
							刷新
						</Button>
						<Button
							variant='ghost'
							size='sm'
							className='text-gray-500 hover:text-gray-700 hover:bg-gray-100'
							onClick={onToggleDebugInfo}>
							<Settings className='w-4 h-4 mr-2' />
							调试信息
						</Button>
					</div>
				</div>

				{showDebugInfo && (
					<DebugInfoPanel
						project={project}
						sortedCommands={project.commands || []}
					/>
				)}

				<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
					<EditorSelector
						project={project}
						selectedEditor={selectedEditor}
						availableEditors={availableEditors}
						isLoadingEditors={isLoadingEditors}
						onEditorChange={onEditorChange}
						onRefreshEditors={onRefreshEditors}
					/>

					<GitBranchSelector
						branches={branches}
						currentBranch={currentBranch}
						isLoadingBranches={isLoadingBranches}
						onSwitchBranch={onSwitchBranch}
					/>

					<NodeVersionSelector
						project={project}
						selectedNodeVersion={selectedNodeVersion}
						installedVersions={installedVersions}
						isLoadingVersions={isLoadingVersions}
						onVersionChange={onVersionChange}
						onInstallNode={onInstallNode}
						isNodeInstalled={isNodeInstalled}
					/>

					<PackageManagerBadge project={project} />
				</div>

				{(project.packageManager === 'yarn' ||
					project.packageManager === 'pnpm') && (
					<div className='mt-4 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded'>
						<Info className='w-4 h-4 mt-0.5 flex-shrink-0' />
						<p>
							使用 {project.packageManager}{' '}
							语法自动适配命令与依赖安装
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export default ProjectInfoCard;
