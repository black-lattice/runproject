import { useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import CommandPalette from '@/components/CommandPalette';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
function ProjectPage() {
	const {
		workspaces,
		selectedProject,
		isLoading,
		runningCommand,
		runningCommands,
		projectTerminals,
		collapsedWorkspaces,
		useKittenRemote,
		terminalType,
		tabs,
		workspaceTags,
		projectTags,
		setWorkspaces,
		setSelectedProject,
		setIsLoading,
		setRunningCommand,
		setCommandRunning,
		clearCommandRunning,
		incrementCommandCounter,
		updateProjectTerminal,
		clearProjectTerminal,
		toggleWorkspaceCollapse,
		setUseKittenRemote,
		addTab,
		normalizeWorkspace,
		normalizeWorkspaces,
		setNodeVersionsCache,
		setWorkspaceTags,
		setProjectTags
	} = useAppStore();

	const { toast } = useToast();
	const navigate = useNavigate();
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const getCommandKey = (project, command) =>
		`${project.path}::${command.name}`;

	useEffect(() => {
		const savedWorkspaces = localStorage.getItem('nodejs-workspaces');
		if (savedWorkspaces) {
			try {
				const parsedWorkspaces = JSON.parse(savedWorkspaces);
				setWorkspaces(parsedWorkspaces);
			} catch (error) {
				console.error('解析保存的workspaces失败:', error);
				toast({
					title: '加载失败',
					description: '加载保存的工作区失败',
					variant: 'destructive'
				});
			}
		}
	}, [setWorkspaces, toast]);

	const clearCacheAndReload = () => {
		if (
			confirm(
				'确定要清除所有缓存并重新加载吗？这将刷新所有workspace数据。'
			)
		) {
			localStorage.removeItem('nodejs-workspaces');
			localStorage.removeItem('nodejs-workspaces-version');
			toast({
				title: '缓存已清除',
				description: '页面将重新加载'
			});
			setTimeout(() => {
				location.reload();
			}, 1000);
		}
	};

	useEffect(() => {
		const handleKeyPress = event => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'w') {
				event.preventDefault();
				handleAddWorkspace();
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setCommandPaletteOpen(true);
			}
			if (
				(event.ctrlKey || event.metaKey) &&
				event.shiftKey &&
				event.key === 'C'
			) {
				event.preventDefault();
				clearCacheAndReload();
			}
		};

		document.addEventListener('keydown', handleKeyPress);
		return () => {
			document.removeEventListener('keydown', handleKeyPress);
		};
	}, []);

	const clearCacheAndRefresh = () => {
		localStorage.removeItem('nodejs-workspaces');
		setWorkspaces([]);
		setSelectedProject(null);
		window.location.reload();
	};

	const saveWorkspaces = newWorkspaces => {
		const currentTime = new Date().getTime();
		const workspacesWithVersion = newWorkspaces.map(workspace => ({
			...workspace,
			_cacheVersion: currentTime,
			_cacheTimestamp: new Date().toLocaleString()
		}));

		localStorage.setItem(
			'nodejs-workspaces',
			JSON.stringify(workspacesWithVersion)
		);
		localStorage.setItem(
			'nodejs-workspaces-version',
			currentTime.toString()
		);
		setWorkspaces(workspacesWithVersion);
	};

	const handleAddWorkspace = async () => {
		console.log('开始添加workspace流程...');
		setIsLoading(true);

		try {
			console.log('准备调用Tauri Dialog插件...');
			const selectedPath = await open({
				title: '选择Workspace文件夹',
				directory: true,
				recursive: true
			});

			console.log('对话框返回结果:', selectedPath);

			if (selectedPath) {
				console.log('选择的文件夹路径:', selectedPath);
				await handleWorkspaceAdded(selectedPath);
			} else {
				console.log('用户取消了选择');
				setIsLoading(false);
			}
		} catch (error) {
			console.error('选择文件夹失败:', error);
			console.error('错误详情:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
			toast({
				title: '选择失败',
				description: `选择文件夹失败: ${error.message || error}`,
				variant: 'destructive'
			});
			setIsLoading(false);
		}
	};

	const handleWorkspaceAdded = async path => {
		try {
			const workspace = await invoke('add_workspace', { path });
			const normalizedWorkspace = normalizeWorkspace(workspace);
			const newWorkspaces = [...workspaces, normalizedWorkspace];
			saveWorkspaces(newWorkspaces);
			toast({
				title: '添加成功',
				description: 'Workspace添加成功',
				variant: 'default'
			});
		} catch (error) {
			toast({
				title: '添加失败',
				description: `添加workspace失败: ${error}`,
				variant: 'destructive'
			});
		} finally {
			setIsLoading(false);
		}
	};

	const removeWorkspace = async index => {
		const currentWorkspaces = useAppStore.getState().workspaces;
		const workspaceToRemove = currentWorkspaces[index];

		if (!workspaceToRemove) {
			toast({
				title: '删除失败',
				description: '未找到要删除的workspace',
				variant: 'destructive'
			});
			return;
		}

		const newWorkspaces = currentWorkspaces.filter((_, i) => i !== index);
		saveWorkspaces(newWorkspaces);
		toast({
			title: '删除成功',
			description: `已删除workspace "${workspaceToRemove.name}"`,
			variant: 'default'
		});

		const currentSelectedProject = useAppStore.getState().selectedProject;
		if (
			currentSelectedProject &&
			workspaceToRemove.projects?.some(
				p => p.name === currentSelectedProject.name
			)
		) {
			setSelectedProject(null);
		}
	};

	const refreshWorkspace = async index => {
		setIsLoading(true);
		try {
			const workspace = workspaces[index];
			const refreshedWorkspace = await invoke('add_workspace', {
				path: workspace.path
			});
			const normalizedWorkspace = normalizeWorkspace(refreshedWorkspace);
			const newWorkspaces = [...workspaces];
			newWorkspaces[index] = normalizedWorkspace;
			saveWorkspaces(newWorkspaces);
			toast({
				title: '刷新成功',
				description: 'Workspace已刷新',
				variant: 'default'
			});
		} catch (error) {
			toast({
				title: '刷新失败',
				description: `刷新workspace失败: ${error}`,
				variant: 'destructive'
			});
		} finally {
			setIsLoading(false);
		}
	};

	const stopProjectCommand = async (project, command) => {
		if (!project || !command) return;
		const commandKey = getCommandKey(project, command);
		const commandState = runningCommands?.[commandKey];
		if (!commandState) return;

		try {
			const projectName = project.name;
			let result;

			if (terminalType === 'builtin') {
				const ctrlC = '\x03';
				const encoded = btoa(ctrlC);
				await invoke('write_to_terminal', {
					sessionId: commandState.id,
					data: encoded
				});
				result = '已发送停止信号';
			} else {
				result = await invoke('terminate_command', {
					commandId: commandState.id
				});
			}

			const existingTerminal = projectTerminals[projectName];
			if (
				existingTerminal &&
				existingTerminal.lastCommandId === commandState.id
			) {
				updateProjectTerminal(projectName, {
					...existingTerminal,
					isBusy: false,
					currentCommand: null
				});
			}

			clearCommandRunning(commandKey);
			if (
				runningCommand &&
				runningCommand.id === commandState.id &&
				runningCommand.project?.name === projectName
			) {
				setRunningCommand(null);
			}
			toast({
				title: '命令停止',
				description: result || `已停止命令: ${command.name}`,
				variant: 'default'
			});
		} catch (error) {
			console.error('停止命令失败:', error);

			const projectName = project.name;
			const existingTerminal = projectTerminals[projectName];
			if (
				existingTerminal &&
				existingTerminal.lastCommandId === commandState.id
			) {
				updateProjectTerminal(projectName, {
					...existingTerminal,
					isBusy: false,
					currentCommand: null
				});
			}
			clearCommandRunning(commandKey);
			if (
				runningCommand &&
				runningCommand.id === commandState.id &&
				runningCommand.project?.name === projectName
			) {
				setRunningCommand(null);
			}
			toast({
				title: '停止失败',
				description: `停止命令失败: ${error}`,
				variant: 'destructive'
			});
		}
	};

	const NODE_VERSIONS_CACHE_TTL = 1000 * 60 * 60 * 24;

	const getInstalledVersions = useCallback(
		async ({ forceRefresh = false } = {}) => {
			try {
				const { nodeVersionsCache } = useAppStore.getState();
				const hasCache =
					!forceRefresh &&
					nodeVersionsCache?.versions?.length > 0 &&
					Date.now() - (nodeVersionsCache.fetchedAt || 0) <
						NODE_VERSIONS_CACHE_TTL;

				if (hasCache) {
					return nodeVersionsCache.versions;
				}

				const result = await invoke('get_nvm_status');
				const versions =
					result?.available &&
					Array.isArray(result.installed_versions)
						? result.installed_versions
						: [];

				setNodeVersionsCache(versions);
				return versions;
			} catch (error) {
				console.error('获取Node版本列表失败:', error);
				return [];
			}
		},
		[setNodeVersionsCache]
	);

	const getEffectiveNodeVersion = project => {
		const preferences = JSON.parse(
			localStorage.getItem('nodejs-project-preferences') || '{}'
		);
		const projectKey = `${project.name}_${project.path}`;
		const userSelected = preferences[projectKey]?.nodeVersion || null;

		if (userSelected) {
			console.log(
				`📋 [${project.name}] 使用用户选择Node版本: ${userSelected}`
			);
			return userSelected;
		}

		if (project.nodeVersion) {
			console.log(
				`📋 [${project.name}] 使用项目本地Node版本: ${project.nodeVersion}`
			);
			return project.nodeVersion;
		}

		console.log(`📋 [${project.name}] 使用系统默认Node版本`);
		return null;
	};

	const executeInBuiltinTerminal = async (project, command) => {
		const projectName = project.name;
		const existingTerminal = projectTerminals[projectName];
		const packageManager =
			project.packageManager || project.package_manager || 'npm';
		const effectiveNodeVersion = getEffectiveNodeVersion(project);
		const commandKey = getCommandKey(project, command);

		let sessionId;
		let needCreateSession = true;

		if (existingTerminal && existingTerminal.lastCommandId) {
			sessionId = existingTerminal.lastCommandId;

			if (existingTerminal.isBusy) {
				sessionId = `project-${project.name}-${Date.now()}`;
				needCreateSession = true;
			} else {
				try {
					await invoke('write_to_terminal', {
						sessionId,
						data: btoa('echo test\n')
					});
					needCreateSession = false;
				} catch (error) {
					console.log('终端会话不存在，将创建新会话');
					sessionId = `project-${project.name}-${Date.now()}`;
				}
			}
		} else {
			sessionId = `project-${project.name}-${Date.now()}`;
		}

		const runId = Date.now();
		setRunningCommand({ project, command, id: sessionId, runId });
		setCommandRunning(commandKey, { project, command, id: sessionId, runId });

		try {
			if (needCreateSession) {
				await invoke('create_terminal_session', {
					sessionId,
					config: {
						cwd: project.path,
						cols: 80,
						rows: 24
					}
				});
			}

			let fullCommand = `${packageManager} run ${command.name}`;
			try {
				const built = await invoke('build_execution_command', {
					command: command.name,
					nodeVersion:
						effectiveNodeVersion && effectiveNodeVersion !== 'system'
							? effectiveNodeVersion
							: null,
					packageManager
				});
				if (built) {
					fullCommand = built;
				}
			} catch (error) {
				console.warn('构建命令失败，使用默认命令:', error);
			}

			const doneMarker = '__RUNPROJECT_CMD_DONE__';
			const commandWithMarker = `${fullCommand.trimEnd()}; echo ${doneMarker}:${runId}:$?\n`;
			const encoded = btoa(
				String.fromCharCode(
					...new TextEncoder().encode(commandWithMarker)
				)
			);
			await invoke('write_to_terminal', { sessionId, data: encoded });

			updateProjectTerminal(projectName, {
				isBusy: true,
				currentCommand: command.name,
				lastCommandId: sessionId,
				runId,
				createdAt: Date.now()
			});

			addTab(`terminal-${sessionId}`);

			navigate(
				`/terminal?sessionId=${sessionId}&title=${project.name}-${command.name}&cwd=${encodeURIComponent(project.path)}`
			);

			toast({
				title: '命令已启动',
				description: `在内置终端中执行: ${command.name}`,
				variant: 'default'
			});
		} catch (error) {
			setRunningCommand(null);
			clearCommandRunning(commandKey);
			console.error('执行命令失败:', error);
			toast({
				title: '执行失败',
				description: `在内置终端中执行命令失败: ${error}`,
				variant: 'destructive'
			});
		}
	};

	const executeProjectCommand = async (project, command) => {
		if (terminalType === 'builtin') {
			return executeInBuiltinTerminal(project, command);
		}

		const projectName = project.name;
		const packageManager =
			project.packageManager || project.package_manager || 'npm';
		const effectiveNodeVersion = getEffectiveNodeVersion(project);
		const existingTerminal = projectTerminals[projectName];
		const shouldReuseTerminal =
			Boolean(existingTerminal) && !useKittenRemote;
		const commandId = useKittenRemote
			? `${projectName}-kitty`
			: `${projectName}-${command.name}-${Date.now()}`;
		const commandKey = getCommandKey(project, command);

		console.log('执行命令的项目对象:', {
			name: project.name,
			path: project.path,
			packageManager: project.packageManager,
			nodeVersion: project.nodeVersion,
			fullProject: project
		});

		const runBackendCommand = async commandFunction =>
			invoke(commandFunction, {
				commandId,
				workingDir: project.path,
				command: command.name,
				nodeVersion: effectiveNodeVersion,
				projectName: project.name,
				commandName: command.name,
				packageManager
			});

		const releaseTerminalState = () => {
			clearProjectTerminal(projectName);
			setRunningCommand(null);
			clearCommandRunning(commandKey);
		};

		if (shouldReuseTerminal) {
			if (existingTerminal.isBusy) {
				toast({
					title: '命令执行中',
					description: `项目 "${projectName}" 的终端正在执行命令 "${existingTerminal.currentCommand}"，请稍候重试`,
					variant: 'default'
				});
				return;
			}

			updateProjectTerminal(projectName, {
				...existingTerminal,
				isBusy: true,
				currentCommand: command.name,
				lastCommandId: commandId
			});
			setRunningCommand({ project, command, id: commandId });
			setCommandRunning(commandKey, { project, command, id: commandId });

			try {
				const result = await runBackendCommand(
					'execute_command_in_kitty'
				);

				if (result.success) {
					toast({
						title: '命令启动',
						description: `在现有终端中启动命令: ${command.name}`,
						variant: 'default'
					});
					return;
				}

				throw new Error(result.error || '终端返回错误');
			} catch (error) {
				updateProjectTerminal(projectName, {
					...existingTerminal,
					isBusy: false,
					currentCommand: null,
					lastCommandId: null
				});
				setRunningCommand(null);
				clearCommandRunning(commandKey);
				console.error('在终端中执行命令失败:', error);
				toast({
					title: '执行失败',
					description: `在终端中执行命令失败: ${error.message || error}`,
					variant: 'destructive'
				});
				return;
			}
		}

		toast({
			title: '正在启动',
			description: `正在为项目 "${projectName}" 创建新的kitty终端执行: ${command.name}`,
			variant: 'default'
		});

		const newTerminal = {
			isBusy: true,
			currentCommand: command.name,
			lastCommandId: commandId,
			createdAt: Date.now()
		};

		updateProjectTerminal(projectName, newTerminal);
		setRunningCommand({ project, command, id: commandId });
		setCommandRunning(commandKey, { project, command, id: commandId });

		const commandFunction = useKittenRemote
			? 'execute_command_with_kitten'
			: 'execute_command_in_kitty';

		try {
			console.log('commandFunction', commandFunction);
			const result = await runBackendCommand(commandFunction);

			if (result.success) {
				toast({
					title: '启动成功',
					description: `已在新kitty终端中启动命令: ${command.name}`,
					variant: 'default'
				});
				return;
			}

			throw new Error(result.error || '终端返回错误');
		} catch (error) {
			releaseTerminalState();
			console.error('执行命令失败:', error);
			toast({
				title: '执行失败',
				description: `执行命令失败: ${error.message || error}`,
				variant: 'destructive'
			});
		}
	};

	return (
		<div className='h-full flex flex-col overflow-hidden bg-gray-100'>
			{/* <Header
				onAddWorkspace={handleAddWorkspace}
				useKittenRemote={useKittenRemote}
				setUseKittenRemote={setUseKittenRemote}
			/> */}
			<div className='flex-1 flex overflow-hidden'>
				<Sidebar
					workspaces={workspaces}
					selectedProject={selectedProject}
					isLoading={isLoading}
					onAddWorkspace={handleAddWorkspace}
					onRefreshWorkspace={refreshWorkspace}
					onRemoveWorkspace={removeWorkspace}
					onProjectSelect={setSelectedProject}
					onExecuteCommand={executeProjectCommand}
					collapsedWorkspaces={collapsedWorkspaces}
					onToggleCollapse={toggleWorkspaceCollapse}
					workspaceTags={workspaceTags}
					onSetWorkspaceTags={setWorkspaceTags}
					projectTags={projectTags}
					onSetProjectTags={setProjectTags}
				/>
				<MainContent
					selectedProject={selectedProject}
					runningCommands={runningCommands}
					onExecuteCommand={executeProjectCommand}
					onStopCommand={stopProjectCommand}
					onGetInstalledVersions={getInstalledVersions}
				/>
			</div>
			<Toaster />
			<CommandPalette
				open={commandPaletteOpen}
				onOpenChange={setCommandPaletteOpen}
				workspaces={workspaces}
				onSelectProject={setSelectedProject}
				onRunCommand={executeProjectCommand}
			/>
		</div>
	);
}

export default ProjectPage;
