import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/store/useAppStore';
import ProjectInfoCard from './ProjectInfoCard';
import CommandList from './CommandList';

const EDITORS_CACHE_TTL = 1000 * 60 * 60 * 24;
const GIT_BRANCHES_CACHE_TTL = 1000 * 60 * 60 * 24;

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

	const [branches, setBranches] = useState([]);
	const [currentBranch, setCurrentBranch] = useState('');
	const [isLoadingBranches, setIsLoadingBranches] = useState(false);
	const [selectedEditor, setSelectedEditor] = useState('');
	const [availableEditors, setAvailableEditors] = useState([]);
	const [isLoadingEditors, setIsLoadingEditors] = useState(false);
	const { toast } = useToast();
	const {
		setAvailableEditorsCache,
		setGitBranchesCache,
		commandTags,
		setCommandTags
	} = useAppStore();

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

	const findBestMatchVersion = useCallback((target, availableVersions) => {
		if (!target || target === 'system') return 'system';
		if (!availableVersions || availableVersions.length === 0) return target;

		const cleanTarget = target.replace(/^v/, '');

		const exactMatch = availableVersions.find(
			v =>
				v === target ||
				v === `v${cleanTarget}` ||
				v.replace(/^v/, '') === cleanTarget
		);
		if (exactMatch) return exactMatch;

		const candidates = availableVersions.filter(v => {
			const cleanV = v.replace(/^v/, '');
			const partsTarget = cleanTarget.split('.');
			const partsV = cleanV.split('.');

			return partsTarget.every((part, index) => part === partsV[index]);
		});

		if (candidates.length > 0) {
			candidates.sort((a, b) => compareVersions(b, a));
			return candidates[0];
		}

		return target;
	}, []);

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

	const sortedCommands = project.commands || [];

	const loadGitBranches = async ({ forceRefresh = false } = {}) => {
		if (!project?.path) return;
		setIsLoadingBranches(true);
		try {
			const { gitBranchesCache } = useAppStore.getState();
			const cachedData = gitBranchesCache[project.path];
			const hasCache =
				!forceRefresh &&
				cachedData &&
				Date.now() - (cachedData.fetchedAt || 0) < GIT_BRANCHES_CACHE_TTL;

			let branchList;
			if (hasCache) {
				branchList = cachedData.branches;
			} else {
				branchList = await invoke('list_branches', {
					projectPath: project.path
				});
				setGitBranchesCache(project.path, branchList);
			}

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

	const loadAvailableEditors = async ({ forceRefresh = false } = {}) => {
		setIsLoadingEditors(true);
		try {
			const { availableEditorsCache } = useAppStore.getState();
			const hasCache =
				!forceRefresh &&
				availableEditorsCache?.editors?.length > 0 &&
				Date.now() - (availableEditorsCache.fetchedAt || 0) < EDITORS_CACHE_TTL;

			let editors;
			if (hasCache) {
				editors = availableEditorsCache.editors;
			} else {
				editors = await invoke('get_available_editors');
				setAvailableEditorsCache(editors);
			}

			setAvailableEditors(editors);

			const preferences = JSON.parse(
				localStorage.getItem('nodejs-project-preferences') || '{}'
			);
			const projectKey = `${project.name}_${project.path}`;
			const userPref = preferences[projectKey]?.editor;

			if (userPref && editors.find(e => e.id === userPref && e.installed)) {
				setSelectedEditor(userPref);
			} else {
				const installedEditor = editors.find(e => e.installed);
				setSelectedEditor(installedEditor ? installedEditor.id : '');
			}
		} catch (error) {
			console.error('加载编辑器列表失败:', error);
			setAvailableEditors([]);
			setSelectedEditor('');
		} finally {
			setIsLoadingEditors(false);
		}
	};

	const handleSwitchBranch = async branchName => {
		if (!branchName || branchName === currentBranch) return;

		setIsLoadingBranches(true);
		try {
			await invoke('switch_branch', {
				projectPath: project.path,
				branch: branchName
			});

			toast({
				title: '分支切换成功',
				description: `已切换到分支 ${branchName}`
			});

			const { clearGitBranchesCache } = useAppStore.getState();
			clearGitBranchesCache(project.path);
			loadGitBranches();
		} catch (error) {
			console.error('切换分支失败:', error);
			toast({
				title: '切换分支失败',
				description: error.toString(),
				variant: 'destructive'
			});
			setIsLoadingBranches(false);
		}
	};

	useEffect(() => {
		const loadAllData = async () => {
			await Promise.all([
				loadGitBranches(),
				loadAvailableEditors(),
				(async () => {
					if (onGetInstalledVersions) {
						setIsLoadingVersions(true);
						try {
							const versions = await onGetInstalledVersions();
							const versionList = versions || [];
							setInstalledVersions(versionList);

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

							const bestMatch = findBestMatchVersion(
								targetVersion,
								versionList
							);
							setSelectedNodeVersion(bestMatch);
						} catch (error) {
							console.error('加载Node版本失败:', error);
							setInstalledVersions([]);
						} finally {
							setIsLoadingVersions(false);
						}
					}
				})()
			]);
		};

		loadAllData();
	}, [
		project.name,
		project.path,
		project.nodeVersion,
		onGetInstalledVersions,
		findBestMatchVersion
	]);

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

	const saveEditorPreference = editorId => {
		setSelectedEditor(editorId);
		const preferences = JSON.parse(
			localStorage.getItem('nodejs-project-preferences') || '{}'
		);
		const projectKey = `${project.name}_${project.path}`;
		const existingPref = preferences[projectKey] || {};
		preferences[projectKey] = {
			...existingPref,
			editor: editorId,
			timestamp: new Date().toISOString()
		};
		localStorage.setItem(
			'nodejs-project-preferences',
			JSON.stringify(preferences)
		);
	};

	const isNodeInstalled = version => {
		if (!version || version === 'system') return true;
		if (!Array.isArray(installedVersions)) return false;

		if (installedVersions.includes(version)) return true;

		return false;
	};

	const handleInstallNode = async e => {
		e.stopPropagation();
		if (!selectedNodeVersion || selectedNodeVersion === 'system') return;

		try {
			const result = await invoke('ensure_node_version', {
				version: selectedNodeVersion
			});

			toast({
				title: '开始安装',
				description: result || `正在安装 Node.js ${selectedNodeVersion}`
			});

			if (onGetInstalledVersions) {
				const versions = await onGetInstalledVersions({ forceRefresh: true });
				setInstalledVersions(versions || []);
			}
		} catch (error) {
			console.error('安装失败:', error);
			toast({
				title: '启动安装失败',
				description: error.toString(),
				variant: 'destructive'
			});
		}
	};

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
							className='w-full'
						>
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
				<ProjectInfoCard
					project={project}
					showDebugInfo={showDebugInfo}
					onToggleDebugInfo={() => setShowDebugInfo(!showDebugInfo)}
					branches={branches}
					currentBranch={currentBranch}
					isLoadingBranches={isLoadingBranches}
					onSwitchBranch={handleSwitchBranch}
					onRefreshBranches={() => loadGitBranches({ forceRefresh: true })}
					selectedNodeVersion={selectedNodeVersion}
					installedVersions={installedVersions}
					isLoadingVersions={isLoadingVersions}
					onVersionChange={saveNodeVersionPreference}
					onInstallNode={handleInstallNode}
					isNodeInstalled={isNodeInstalled}
					selectedEditor={selectedEditor}
					availableEditors={availableEditors}
					isLoadingEditors={isLoadingEditors}
					onEditorChange={saveEditorPreference}
					onRefreshEditors={loadAvailableEditors}
				/>

				<CommandList
					project={project}
					runningCommand={runningCommand}
					commands={sortedCommands}
					onExecuteCommand={onExecuteCommand}
					onStopCommand={onStopCommand}
					commandTags={commandTags}
					onSetCommandTags={setCommandTags}
				/>
			</div>
		</div>
	);
}

export default ProjectDetails;
