import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { connectServer, disconnectServer, listTools, callTool } from '@proj-airi/tauri-plugin-mcp';

const initialState = {
	servers: [],
	activeServerId: null,
	status: 'idle',
	tools: [],
	lastResult: null,
	error: null,
	isInvoking: false,
	isRefreshingTools: false
};

export const useMcpStore = create(
	persist(
		(set, get) => ({
			...initialState,
			registerServer: server => {
				const normalized = {
					...server,
					args: server.args ?? [],
					installedAt: server.installedAt ?? Date.now()
				};

				set(state => {
					const exists = state.servers.some(item => item.id === normalized.id);
					if (exists) {
						return {
							servers: state.servers.map(item => (item.id === normalized.id ? { ...item, ...normalized } : item))
						};
					}

					return {
						servers: [...state.servers, normalized]
					};
				});
			},
			removeServer: serverId => {
				set(state => {
					const remaining = state.servers.filter(server => server.id !== serverId);
					const isActiveTarget = state.activeServerId === serverId;

					return {
						servers: remaining,
						...(isActiveTarget
							? {
								activeServerId: null,
								status: 'idle',
								tools: [],
								lastResult: null
							}
							: {})
					};
				});
			},
			connectToServer: async serverId => {
				const { servers } = get();
				const target = servers.find(server => server.id === serverId);

				if (!target) {
					throw new Error('未找到对应的 MCP server');
				}

				set({
					status: 'connecting',
					error: null,
					activeServerId: serverId,
					tools: [],
					lastResult: null
				});

				if (!target.command) {
					set({
						status: 'error',
						activeServerId: null,
						tools: [],
						lastResult: null,
						error: '该 MCP server 尚未配置启动命令，请先完成安装配置。'
					});
					throw new Error('该 MCP server 尚未配置启动命令，请先完成安装配置。');
				}

				try {
					await connectServer(target.command, target.args ?? []);
					const tools = await listTools();
					set({
						status: 'connected',
						tools,
						error: null
					});
					return tools;
				} catch (error) {
					set({
						status: 'error',
						activeServerId: null,
						tools: [],
						error: error.message || String(error)
					});
					throw error;
				}
			},
			disconnectFromServer: async () => {
				if (!get().activeServerId) return;

				set({ status: 'disconnecting' });

				try {
					await disconnectServer();
				} finally {
					set({
						...initialState,
						servers: get().servers
					});
				}
			},
			refreshTools: async () => {
				if (!get().activeServerId) {
					throw new Error('尚未连接任何 MCP server');
				}

				set({ isRefreshingTools: true });

				try {
					const tools = await listTools();
					set({
						tools,
						error: null
					});
					return tools;
				} finally {
					set({ isRefreshingTools: false });
				}
			},
			invokeTool: async (toolName, payload = {}) => {
				if (!get().activeServerId) {
					throw new Error('尚未连接任何 MCP server');
				}

				set({ isInvoking: true, error: null });

				try {
					const result = await callTool(toolName, payload);
					set({
						lastResult: {
							toolName,
							timestamp: Date.now(),
							...result
						}
					});
					return result;
				} catch (error) {
					set({
						error: error.message || String(error)
					});
					throw error;
				} finally {
					set({ isInvoking: false });
				}
			},
			resetMcpState: () => {
				set({
					...initialState,
					servers: get().servers
				});
			}
		}),
		{
			name: 'mcp-store',
			storage: createJSONStorage(() => localStorage),
			partialize: state => ({
				servers: state.servers,
				activeServerId: state.activeServerId
			})
		}
	)
);

export default useMcpStore;
