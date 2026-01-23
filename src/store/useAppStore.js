import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';

const DEFAULT_TABS = [];
let commandStatusSyncInitialized = false;

export const useAppStore = create(
	persist(
		(set, get) => ({
			// === 现有的应用状态 ===
			workspaces: [],
			selectedProject: null,
			isLoading: false,
			runningCommand: null,
			runningCommands: {},
			commandCounter: 0,
			projectTerminals: {},
			nodeVersionsCache: {
				versions: [],
				fetchedAt: 0
			},
			availableEditorsCache: {
				editors: [],
				fetchedAt: 0
			},
			gitBranchesCache: {},
			collapsedWorkspaces: {},
			useKittenRemote: true,
			terminalType: 'builtin', // 'builtin' | 'kitty'

			// === 微前端代理状态 ===
			proxyReady: false,

			// === Workspace 标签 ===
			workspaceTags: {}, // { [workspacePath]: string[] }
			projectTags: {}, // { [projectPath]: string[] }
			commandTags: {}, // { [commandKey]: string[] }

			// === 页签管理状态 ===
			tabs: DEFAULT_TABS,
			// 移除 activeTab，由路由控制

			// === 状态更新 Actions ===

			// Workspace 相关
			setWorkspaces: workspaces => {
				const normalized = get().normalizeWorkspaces(workspaces);
				set({ workspaces: normalized });
			},

			// 数据规范化
			normalizeProject: project => {
				if (!project) return project;
				return {
					...project,
					packageManager:
						project.packageManager || project.package_manager || 'npm',
					nodeVersion: project.nodeVersion || project.node_version || null,
					commands: project.commands || []
				};
			},

			normalizeWorkspace: workspace => {
				if (!workspace) return workspace;
				return {
					...workspace,
					projects: (workspace.projects || []).map(get().normalizeProject)
				};
			},

			normalizeWorkspaces: workspaces =>
				(workspaces || []).map(get().normalizeWorkspace),

			clearWorkspaces: () => {
				set({
					workspaces: [],
					selectedProject: null,
					projectTerminals: {}
				});
				localStorage.removeItem('nodejs-workspaces');
				localStorage.removeItem('nodejs-workspaces-version');
			},

			setSelectedProject: project => set({ selectedProject: project }),
			setIsLoading: loading => set({ isLoading: loading }),
			setRunningCommand: command => set({ runningCommand: command }),
			setCommandRunning: (commandKey, payload) => {
				if (!commandKey) return;
				set(state => ({
					runningCommands: {
						...state.runningCommands,
						[commandKey]: payload
					}
				}));
			},
			clearCommandRunning: commandKey => {
				if (!commandKey) return;
				set(state => {
					if (!state.runningCommands?.[commandKey]) return state;
					const next = { ...state.runningCommands };
					delete next[commandKey];
					return { runningCommands: next };
				});
			},

			clearRunningCommandBySessionId: (sessionId, runId = null) => {
				const currentState = get();
				const nextRunningCommands = { ...currentState.runningCommands };
				const matchedProjects = new Set();

				for (const [key, value] of Object.entries(
					currentState.runningCommands
				)) {
					if (!value || value.id !== sessionId) continue;
					if (runId !== null && value.runId !== runId) continue;
					if (value.project?.name) {
						matchedProjects.add(value.project.name);
					}
					delete nextRunningCommands[key];
				}

				const updates = { runningCommands: nextRunningCommands };
				const currentRunningCommand = currentState.runningCommand;
				if (
					currentRunningCommand &&
					currentRunningCommand.id === sessionId &&
					(runId === null || currentRunningCommand.runId === runId)
				) {
					updates.runningCommand = null;
					if (currentRunningCommand.project?.name) {
						matchedProjects.add(currentRunningCommand.project.name);
					}
				}

				const currentProjectTerminals = currentState.projectTerminals;
				if (matchedProjects.size > 0) {
					let nextProjectTerminals = null;
					for (const projectName of matchedProjects) {
						const existingTerminal = currentProjectTerminals[projectName];
						if (
							existingTerminal &&
							existingTerminal.lastCommandId === sessionId
						) {
							if (!nextProjectTerminals) {
								nextProjectTerminals = { ...currentProjectTerminals };
							}
							nextProjectTerminals[projectName] = {
								...existingTerminal,
								isBusy: false,
								currentCommand: null
							};
						}
					}
					if (nextProjectTerminals) {
						updates.projectTerminals = nextProjectTerminals;
					}
				}

				set(updates);
			},

			initCommandStatusSync: async () => {
				if (commandStatusSyncInitialized) return;
				commandStatusSyncInitialized = true;

				const handleEvent = event => {
					const sessionId = event?.payload?.sessionId;
					if (!sessionId) return;
					const runId =
						typeof event?.payload?.runId === 'number'
							? event.payload.runId
							: null;
					get().clearRunningCommandBySessionId(sessionId, runId);
				};

				await listen('command-interrupted', handleEvent);
				await listen('command-finished', handleEvent);
				await listen('terminal-closed', handleEvent);
			},

			// 终端状态
			updateProjectTerminal: (projectName, terminalState) => {
				set(state => ({
					projectTerminals: {
						...state.projectTerminals,
						[projectName]: terminalState
					}
				}));
			},

			clearProjectTerminal: projectName => {
				set(state => {
					const { [projectName]: _, ...rest } = state.projectTerminals;
					return { projectTerminals: rest };
				});
			},

			toggleWorkspaceCollapse: workspaceIndex => {
				set(state => ({
					collapsedWorkspaces: {
						...state.collapsedWorkspaces,
						[workspaceIndex]: !state.collapsedWorkspaces[workspaceIndex]
					}
				}));
			},

			setUseKittenRemote: useKittenRemote => set({ useKittenRemote }),
			setTerminalType: terminalType => set({ terminalType }),

			// === 微前端代理 Actions ===
			setProxyReady: proxyReady => set({ proxyReady }),

			setNodeVersionsCache: versions => {
				set({
					nodeVersionsCache: {
						versions,
						fetchedAt: Date.now()
					}
				});
			},

			clearNodeVersionsCache: () =>
				set({
					nodeVersionsCache: {
						versions: [],
						fetchedAt: 0
					}
				}),

			setAvailableEditorsCache: editors => {
				set({
					availableEditorsCache: {
						editors,
						fetchedAt: Date.now()
					}
				});
			},

			clearAvailableEditorsCache: () =>
				set({
					availableEditorsCache: {
						editors: [],
						fetchedAt: 0
					}
				}),

			setGitBranchesCache: (projectPath, branches) => {
				set(state => ({
					gitBranchesCache: {
						...state.gitBranchesCache,
						[projectPath]: {
							branches,
							fetchedAt: Date.now()
						}
					}
				}));
			},

			clearGitBranchesCache: projectPath => {
				set(state => {
					const newCache = { ...state.gitBranchesCache };
					delete newCache[projectPath];
					return { gitBranchesCache: newCache };
				});
			},

			// === Workspace 标签 Actions ===

			setWorkspaceTags: (workspacePath, tags) => {
				const normalized = (tags || [])
					.map(tag => String(tag).trim())
					.filter(Boolean);
				set(state => ({
					workspaceTags: {
						...state.workspaceTags,
						[workspacePath]: normalized
					}
				}));
			},

			clearWorkspaceTags: workspacePath => {
				set(state => {
					const next = { ...state.workspaceTags };
					delete next[workspacePath];
					return { workspaceTags: next };
				});
			},

			// === Project 标签 Actions ===

			setProjectTags: (projectPath, tags) => {
				const normalized = (tags || [])
					.map(tag => String(tag).trim())
					.filter(Boolean);
				set(state => ({
					projectTags: {
						...state.projectTags,
						[projectPath]: normalized
					}
				}));
			},

			clearProjectTags: projectPath => {
				set(state => {
					const next = { ...state.projectTags };
					delete next[projectPath];
					return { projectTags: next };
				});
			},

			// === Command 标签 Actions ===

			setCommandTags: (commandKey, tags) => {
				const normalized = (tags || [])
					.map(tag => String(tag).trim())
					.filter(Boolean);
				set(state => ({
					commandTags: {
						...state.commandTags,
						[commandKey]: normalized
					}
				}));
			},

			clearCommandTags: commandKey => {
				set(state => {
					const next = { ...state.commandTags };
					delete next[commandKey];
					return { commandTags: next };
				});
			},

			// === 简化的页签 Actions ===

			addTab: tabId => {
				const state = get();
				if (tabId === 'welcome') return;

				if (!state.tabs.includes(tabId)) {
					set({ tabs: [...state.tabs, tabId] });
				}
			},

			closeTab: tabId => {
				const state = get();
				set({
					tabs: state.tabs.filter(id => id !== tabId)
				});
			},

			reset: () => {
				set({
					workspaces: [],
					selectedProject: null,
					isLoading: false,
					runningCommand: null,
					runningCommands: {},
					projectTerminals: {},
					nodeVersionsCache: {
						versions: [],
						fetchedAt: 0
					},
					availableEditorsCache: {
						editors: [],
						fetchedAt: 0
					},
					tabs: DEFAULT_TABS,
					workspaceTags: {},
					projectTags: {},
					commandTags: {}
				});
				localStorage.clear();
			}
		}),
		{
			name: 'app-storage',
			storage: createJSONStorage(() => localStorage),
			partialize: state => ({
				workspaces: state.workspaces,
				collapsedWorkspaces: state.collapsedWorkspaces,
				useKittenRemote: state.useKittenRemote,
				terminalType: state.terminalType,
				tabs: state.tabs,
				nodeVersionsCache: state.nodeVersionsCache,
				availableEditorsCache: state.availableEditorsCache,
				workspaceTags: state.workspaceTags,
				projectTags: state.projectTags,
				commandTags: state.commandTags
			})
		}
	)
);

export default useAppStore;
