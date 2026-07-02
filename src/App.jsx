import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { HashRouter as Router, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import { AppRouter } from './router';
import { useAppStore } from './store/useAppStore';
import { PAGE_CONFIGS } from './config/routes';

const TRAY_SYNC_DELAY = 800;

function TrayEventBridge() {
	const navigate = useNavigate();
	const addTab = useAppStore(state => state.addTab);

	useEffect(() => {
		let unlisten = null;
		let cancelled = false;

		const setupListener = async () => {
			const dispose = await listen('tray-open-page', event => {
				const page = event?.payload?.page;
				const config = PAGE_CONFIGS[page];
				if (!config) return;

				addTab(page);
				navigate(config.path);
			});

			if (cancelled) {
				dispose();
				return;
			}
			unlisten = dispose;
		};

		setupListener();

		return () => {
			cancelled = true;
			if (unlisten) unlisten();
		};
	}, [addTab, navigate]);

	return null;
}

function App() {
	const workspaces = useAppStore(state => state.workspaces);

	useEffect(() => {
		useAppStore.getState().initCommandStatusSync();
	}, []);

	useEffect(() => {
		const state = useAppStore.getState();
		if (state.workspaces?.length) return;

		const savedWorkspaces = localStorage.getItem('nodejs-workspaces');
		if (!savedWorkspaces) return;

		try {
			state.setWorkspaces(JSON.parse(savedWorkspaces));
		} catch (error) {
			console.error('加载保存的工作区失败:', error);
		}
	}, []);

	useEffect(() => {
		const projects = (workspaces || []).flatMap(workspace =>
			(workspace.projects || []).map(project => ({
				name: project.name,
				path: project.path,
				nodeVersion: project.nodeVersion || project.node_version || null,
				packageManager:
					project.packageManager || project.package_manager || 'npm',
				commands: project.commands || []
			}))
		);

		const syncPayload = JSON.stringify(projects);
		if (window.__RUNPROJECT_LAST_TRAY_SYNC__ === syncPayload) {
			return;
		}

		const timer = window.setTimeout(() => {
			if (window.__RUNPROJECT_LAST_TRAY_SYNC__ === syncPayload) {
				return;
			}

			window.__RUNPROJECT_LAST_TRAY_SYNC__ = syncPayload;
			invoke('sync_tray_projects', { projects }).catch(error => {
				window.__RUNPROJECT_LAST_TRAY_SYNC__ = null;
				console.error('同步菜单栏项目菜单失败:', error);
			});
		}, TRAY_SYNC_DELAY);

		return () => window.clearTimeout(timer);
	}, [workspaces]);

	useEffect(() => {
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const syncSystemTheme = () => {
			document.documentElement.classList.toggle('dark', media.matches);
			document.documentElement.style.colorScheme = media.matches
				? 'dark'
				: 'light';

			invoke('set_tray_theme', {
				theme: media.matches ? 'dark' : 'light'
			}).catch(error => {
				console.error('同步菜单栏图标主题失败:', error);
			});
		};

		syncSystemTheme();
		media.addEventListener('change', syncSystemTheme);

		return () => {
			media.removeEventListener('change', syncSystemTheme);
		};
	}, []);

	return (
		<Router>
			<TrayEventBridge />
			<div className='h-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950 dark:text-gray-100'>
				{/* 自定义标题栏（包含 TabBar） */}
				<TitleBar>
					<TabBar />
				</TitleBar>

				{/* 主内容区域 */}
				<div className='flex-1 overflow-hidden relative'>
					<AppRouter />
				</div>

				{/* Toast提示 */}
				<Toaster />
			</div>
		</Router>
	);
}

export default App;
