import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const DEFAULT_TABS = [];
const DEFAULT_HOME_SITES = [
	{ id: 'home-bing', title: 'Bing', url: 'https://www.bing.com/' },
	{ id: 'home-bilibili', title: 'Bilibili', url: 'https://www.bilibili.com/' },
	{ id: 'home-github', title: 'GitHub', url: 'https://github.com/' }
];

export const useAppStore = create(
	persist(
		(set, get) => ({
			// === 现有的应用状态 ===
			workspaces: [],
			selectedProject: null,
			isLoading: false,
			runningCommand: null,
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

			// === 收藏夹状态 ===
			bookmarks: [], // { id, url, title, favicon, createdAt, lastVisited }

			// === Home 网站列表（持久化）===
			homeSites: DEFAULT_HOME_SITES, // { id, title, url }

			// === Workspace 标签 ===
			workspaceTags: {}, // { [workspacePath]: string[] }
			projectTags: {}, // { [projectPath]: string[] }

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

			// === 收藏夹 Actions ===

			addBookmark: bookmark => {
				const newBookmark = {
					id: Date.now().toString(),
					createdAt: Date.now(),
					lastVisited: Date.now(),
					...bookmark
				};
				set(state => ({
					bookmarks: [...state.bookmarks, newBookmark]
				}));
			},

			removeBookmark: id => {
				set(state => ({
					bookmarks: state.bookmarks.filter(b => b.id !== id)
				}));
			},

			updateBookmark: (id, updates) => {
				set(state => ({
					bookmarks: state.bookmarks.map(b =>
						b.id === id ? { ...b, ...updates } : b
					)
				}));
			},

			updateBookmarkLastVisited: id => {
				set(state => ({
					bookmarks: state.bookmarks.map(b =>
						b.id === id ? { ...b, lastVisited: Date.now() } : b
					)
				}));
			},

			// === HomeSites Actions ===
			addHomeSite: site => {
				const { title, url } = site || {};
				if (!url) return;

				const normalizedUrl = String(url).trim();
				if (!normalizedUrl) return;

				set(state => {
					const exists = state.homeSites.some(s => s.url === normalizedUrl);
					if (exists) return state;

					const id = `home-${Date.now()}-${Math.random().toString(16).slice(2)}`;
					return {
						homeSites: [
							...state.homeSites,
							{
								id,
								title: title || normalizedUrl,
								url: normalizedUrl
							}
						]
					};
				});
			},

			removeHomeSite: id => {
				set(state => ({
					homeSites: state.homeSites.filter(s => s.id !== id)
				}));
			},

			updateHomeSite: (id, updates) => {
				set(state => ({
					homeSites: state.homeSites.map(s =>
						s.id === id ? { ...s, ...updates } : s
					)
				}));
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
					homeSites: DEFAULT_HOME_SITES,
					workspaceTags: {},
					projectTags: {}
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
				bookmarks: state.bookmarks,
				homeSites: state.homeSites,
				workspaceTags: state.workspaceTags,
				projectTags: state.projectTags
			})
		}
	)
);

export default useAppStore;
