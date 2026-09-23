import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { HashRouter as Router } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import { AppRouter } from './router';
import { useAppStore } from './store/useAppStore';
import ReminderBridge from './components/ReminderBridge';
import { startDataSync } from './store/dataSync';
import { startScriptRunSync } from './store/useScriptRunStore';

function App() {
	useEffect(() => {
		startDataSync();
		localStorage.removeItem('agent-storage');
		localStorage.removeItem('mcp-store');

		if (isTauri()) {
			startScriptRunSync();
			useAppStore.getState().initCommandStatusSync();
		}
	}, []);

	useEffect(() => {
		if (isTauri()) return;
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

	return (
		<Router>
            <ReminderBridge />
			<div className='app-shell h-screen flex flex-col overflow-hidden text-foreground'>
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
