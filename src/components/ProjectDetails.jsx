import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
	Play,
	Square,
	Terminal,
	Code2,
	Package,
	Folder,
	Info,
	Settings,
	GitBranch,
	RefreshCw,
	Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

function ProjectDetails({
	project,
	runningCommand,
	onExecuteCommand,
	onStopCommand,
	onGetInstalledVersions
}) {
	const [showDebugInfo, setShowDebugInfo] = useState(false);
	const [selectedNodeVersion, setSelectedNodeVersion] = useState('system');
	const [installedVersions, setInstalledVersions] = useState([]);
	const [isLoadingVersions, setIsLoadingVersions] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [errorInfo, setErrorInfo] = useState(null);

	// Git Branch State
	const [branches, setBranches] = useState([]);
	const [currentBranch, setCurrentBranch] = useState('');
	const [isLoadingBranches, setIsLoadingBranches] = useState(false);
	const { toast } = useToast();

	// 辅助函数：语义化版本比较
	const compareVersions = (v1, v2) => {
		const cleanV1 = v1.replace(/^v/, '').split('.').map(Number);
		const cleanV2 = v2.replace(/^v/, '').split('.').map(Number);

		for (let i = 0; i < Math.max(cleanV1.length, cleanV2.length); i++) {
			const num1 = isNaN(cleanV1[i]) ? 0 : cleanV1[i];
			const num2 = isNaN(cleanV2[i]) ? 0 : cleanV2[i];
			if (num1 > num2) return 1;
			if (num1 < num2) return -1;
		}
		return 0;
	};

	// 辅助函数：查找最佳匹配版本
	const findBestMatchVersion = useCallback((target, availableVersions) => {
		if (!target || target === 'system') return 'system';
		if (!availableVersions || availableVersions.length === 0) return target;

		const cleanTarget = target.replace(/^v/, '');

		// 1. 精确匹配
		const exactMatch = availableVersions.find(v =>
			v === target || v === `v${cleanTarget}` || v.replace(/^v/, '') === cleanTarget
		);
		if (exactMatch) return exactMatch;

		// 2. 前缀匹配 (e.g. target="22" matches "v22.14.1", "v22.25.3")
		const candidates = availableVersions.filter(v => {
			const cleanV = v.replace(/^v/, '');
			const partsTarget = cleanTarget.split('.');
			const partsV = cleanV.split('.');

			// 检查 target 的每一位是否与 v 匹配
			return partsTarget.every((part, index) => part === partsV[index]);
		});

		if (candidates.length > 0) {
			// 降序排列，取最新的
			candidates.sort((a, b) => compareVersions(b, a));
			return candidates[0];
		}

		return target;
	}, []);

	// 验证project对象
	if (!project) {
		return (
			<div className='flex items-center justify-center h-full p-6 bg-red-50'>
				<Card className='w-full max-w-md border-red-200 shadow-lg'>
					<CardHeader>
						<CardTitle className='text-red-600 flex items-center gap-2'>
							<Info className='w-5 h-5' /> 项目数据错误
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className='text-red-600'>项目对象为空或未定义</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!project.name || !project.path) {
		return (
			<div className='flex items-center justify-center h-full p-6 bg-red-50'>
				<Card className='w-full max-w-md border-red-200 shadow-lg'>
					<CardHeader>
						<CardTitle className='text-red-600 flex items-center gap-2'>
							<Info className='w-5 h-5' /> 项目数据不完整
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className='text-red-600'>
							项目缺少必要属性 (name: {project.name}, path: {project.path})
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const isCommandRunning = command => {
		return (
			runningCommand &&
			runningCommand.project === project &&
			runningCommand.command === command
		);
	};

	// 使用package.json中scripts的实际顺序
	const sortedCommands = project.commands || [];

	// 加载 Git 分支
	const loadGitBranches = async () => {
		if (!project?.path) return;
		setIsLoadingBranches(true);
		try {
			const branchList = await invoke('list_branches', { projectPath: project.path });
			setBranches(branchList);
			const current = branchList.find(b => b.is_current);
			if (current) {
				setCurrentBranch(current.name);
			}
		} catch (error) {
			console.error('加载 Git 分支失败:', error);
			setBranches([]);
			setCurrentBranch('');
		} finally {
			setIsLoadingBranches(false);
		}
	};

	// 切换分支
	const handleSwitchBranch = async (branchName) => {
		if (!branchName || branchName === currentBranch) return;

		setIsLoadingBranches(true);
		try {
			await invoke('switch_branch', {
				projectPath: project.path,
				branch: branchName
			});

			toast({
				title: "分支切换成功",
				description: `已切换到分支 ${branchName}`,
			});

			// 重新加载分支状态
			loadGitBranches();
		} catch (error) {
			console.error('切换分支失败:', error);
			toast({
				title: "切换分支失败",
				description: error.toString(),
				variant: "destructive"
			});
			setIsLoadingBranches(false);
		}
	};

	// 当项目路径变化时加载分支
	useEffect(() => {
		loadGitBranches();
	}, [project.path]);

	// 加载已安装的Node版本并初始化选择
	useEffect(() => {
		const loadInstalledVersions = async () => {
			if (onGetInstalledVersions) {
				setIsLoadingVersions(true);
				try {
					const versions = await onGetInstalledVersions();
					const versionList = versions || [];
					setInstalledVersions(versionList);

					// 决定初始选中的版本
					const preferences = JSON.parse(
						localStorage.getItem('nodejs-project-preferences') || '{}'
					);
					const projectKey = `${project.name}_${project.path}`;
					const userPref = preferences[projectKey]?.nodeVersion;

					let targetVersion = 'system';

					if (userPref) {
						targetVersion = userPref;
					} else if (project.nodeVersion) {
						targetVersion = project.nodeVersion;
					}

					// 尝试匹配最佳版本
					const bestMatch = findBestMatchVersion(targetVersion, versionList);
					setSelectedNodeVersion(bestMatch);

				} catch (error) {
					console.error('加载Node版本失败:', error);
					setInstalledVersions([]);
				} finally {
					setIsLoadingVersions(false);
				}
			}
		};

		loadInstalledVersions();
	}, [project.name, project.path, project.nodeVersion, onGetInstalledVersions, findBestMatchVersion]);

	// 保存Node版本偏好
	const saveNodeVersionPreference = version => {
		setSelectedNodeVersion(version);
		const preferences = JSON.parse(
			localStorage.getItem('nodejs-project-preferences') || '{}'
		);
		const projectKey = `${project.name}_${project.path}`;
		preferences[projectKey] = {
			nodeVersion: version,
			timestamp: new Date().toISOString()
		};
		localStorage.setItem(
			'nodejs-project-preferences',
			JSON.stringify(preferences)
		);
	};

	// 检查版本是否安装
	const isNodeInstalled = (version) => {
		if (!version || version === 'system') return true;
		if (!Array.isArray(installedVersions)) return false;

		// 检查 version 是否在列表里
		if (installedVersions.includes(version)) return true;

		// 如果 version 是模糊版本 (如 '22')，而列表里有 'v22.x.x'，应该算已安装？
		// 根据需求：如果没安装，显示安装按钮。
		// 如果 selectedNodeVersion 已经是通过 findBestMatchVersion 计算过的，那么它应该是列表里的完整版本（如果存在）。
		// 如果它不在列表里，说明确实没安装。
		return false;
	};

	// 安装 Node 版本
	const handleInstallNode = async (e) => {
		e.stopPropagation();
		if (!selectedNodeVersion || selectedNodeVersion === 'system') return;

		// 构造命令：npm --version (作为前缀骗过后端检查) && source nvm && nvm install version
		const command = `npm --version > /dev/null && source ~/.nvm/nvm.sh && nvm install ${selectedNodeVersion}`;

		try {
			await invoke('execute_command_in_kitty', {
				commandId: `install-node-${selectedNodeVersion}-${Date.now()}`,
				workingDir: project.path,
				command: command,
				nodeVersion: null, // 不切换版本，只安装
				projectName: project.name,
				commandName: `Install Node ${selectedNodeVersion}`,
				packageManager: 'npm'
			});

			toast({
				title: "开始安装",
				description: `正在终端中安装 Node.js ${selectedNodeVersion}`,
			});
		} catch (error) {
			console.error('安装失败:', error);
			toast({
				title: "启动安装失败",
				description: error.toString(),
				variant: "destructive"
			});
		}
	};

	// 错误边界处理
	if (hasError) {
		return (
			<div className='p-6 h-full flex items-center justify-center bg-gray-50'>
				<Card className='w-full max-w-lg border-red-200 shadow-lg'>
					<CardHeader>
						<CardTitle className='text-red-600 flex items-center gap-2'>
							<Info className='w-5 h-5' /> 组件渲染错误
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<p className='text-gray-600'>项目详情组件渲染时发生错误：</p>
						<pre className='text-red-500 text-xs bg-red-50 p-4 rounded-lg overflow-auto border border-red-100 font-mono'>
							{errorInfo && errorInfo.toString()}
						</pre>
						<Button
							onClick={() => {
								setHasError(false);
								setErrorInfo(null);
							}}
							variant='destructive'
							className='w-full'>
							重试
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className='flex-1 bg-gray-50/50 p-6 overflow-y-auto h-full'>
			<div className='max-w-7xl mx-auto space-y-6'>
				{/* 顶部项目信息卡片 */}
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
							<div className="flex gap-2">
								<Button
									variant='ghost'
									size='sm'
									className='text-gray-500 hover:text-gray-700 hover:bg-gray-100'
									onClick={loadGitBranches}
									title='刷新 Git 分支'>
									<RefreshCw className={`w-4 h-4 mr-2 ${isLoadingBranches ? 'animate-spin' : ''}`} />
									刷新
								</Button>
								<Button
									variant='ghost'
									size='sm'
									className='text-gray-500 hover:text-gray-700 hover:bg-gray-100'
									onClick={() => setShowDebugInfo(!showDebugInfo)}>
									<Settings className='w-4 h-4 mr-2' />
									调试信息
								</Button>
							</div>
						</div>

						{/* 调试信息面板 */}
						{showDebugInfo && (
							<Alert className='mb-6 bg-yellow-50/50 border-yellow-200'>
								<AlertDescription className='text-sm text-yellow-800 font-mono space-y-1'>
									<div className='font-bold mb-2 flex items-center gap-2'>
										<Info className='w-4 h-4' /> Debug Info
									</div>
									<div>Cache Version: {project._cacheVersion || 'N/A'}</div>
									<div>
										Cache Time: {project._cacheTimestamp || 'N/A'}
									</div>
									<div>Commands Count: {sortedCommands.length}</div>
								</AlertDescription>
							</Alert>
						)}

						<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
							{/* Git Branch Selector */}
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
											onValueChange={handleSwitchBranch}
											disabled={isLoadingBranches}>
											<SelectTrigger className='w-full h-8 border-none bg-transparent shadow-none p-0 focus:ring-0 text-sm font-medium text-gray-900'>
												<SelectValue placeholder="Select Branch" />
											</SelectTrigger>
											<SelectContent>
												{branches.map(branch => (
													<SelectItem key={branch.name} value={branch.name}>
														{branch.name} {branch.is_current && '(Current)'}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<span className="text-sm text-gray-400 italic">No Git Repo</span>
									)}
								</div>
							</div>

							{/* Node Version Selector */}
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
												onValueChange={saveNodeVersionPreference}>
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

									{/* 安装按钮 - 仅当版本未安装时显示 */}
									{!isNodeInstalled(selectedNodeVersion) && !isLoadingVersions && selectedNodeVersion !== 'system' && (
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8 text-blue-600 border-blue-200 hover:bg-blue-50 flex-shrink-0"
														onClick={handleInstallNode}
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

							{/* Package Manager Badge */}
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
						</div>

						{/* 包管理器提示信息 */}
						{(project.packageManager === 'yarn' ||
							project.packageManager === 'pnpm') && (
								<div className='mt-4 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded'>
									<Info className='w-4 h-4 mt-0.5 flex-shrink-0' />
									<p>
										使用 {project.packageManager} 语法自动适配命令与依赖安装
									</p>
								</div>
							)}
					</CardContent>
				</Card>

				{/* 命令列表区域 */}
				<div className='space-y-4'>
					<div className='flex items-center justify-between'>
						<h3 className='text-lg font-bold text-gray-800 flex items-center gap-2'>
							<Terminal className='w-5 h-5 text-gray-500' />
							Scripts
							<Badge variant='secondary' className='ml-2 text-xs font-normal'>
								{sortedCommands.length}
							</Badge>
						</h3>
					</div>

					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
						{sortedCommands.map((command, commandIndex) => {
							const running = isCommandRunning(command);
							return (
								<TooltipProvider key={commandIndex}>
									<Tooltip>
										<TooltipTrigger asChild>
											<Card
												className={`group relative overflow-hidden transition-all duration-200 hover:shadow-md border-transparent hover:border-gray-200 ${running
													? 'bg-blue-50/50 ring-2 ring-blue-500 ring-offset-2'
													: 'bg-white hover:-translate-y-1'
													}`}>
												<CardContent className='p-4'>
													<div className='flex justify-between items-start gap-3 mb-3'>
														<div className='min-w-0 flex-1'>
															<h4 className='font-bold text-gray-800 truncate mb-1 group-hover:text-blue-600 transition-colors'>
																{command.name}
															</h4>
															<code className='text-xs text-gray-400 block truncate font-mono bg-gray-50 px-1.5 py-0.5 rounded'>
																{command.script}
															</code>
														</div>
														<div
															className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${running
																? 'bg-green-500 animate-pulse'
																: 'bg-gray-200'
																}`}
														/>
													</div>

													<div className='flex items-center gap-2 mt-4'>
														<Button
															className={`flex-1 h-9 shadow-sm transition-all duration-200 ${running
																? 'bg-red-500 hover:bg-red-600 text-white'
																: 'bg-gray-900 hover:bg-blue-600 text-white'
																}`}
															onClick={e => {
																e.stopPropagation();
																if (running) {
																	onStopCommand();
																} else {
																	onExecuteCommand(project, command);
																}
															}}>
															{running ? (
																<>
																	<Square className='w-4 h-4 mr-2 fill-current' />
																	Stop
																</>
															) : (
																<>
																	<Play className='w-4 h-4 mr-2 fill-current' />
																	Run
																</>
															)}
														</Button>
													</div>
												</CardContent>
											</Card>
										</TooltipTrigger>
										<TooltipContent
											side='bottom'
											className='max-w-sm break-all font-mono text-xs'>
											<p>{command.script}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

export default ProjectDetails;
