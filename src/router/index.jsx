import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PAGE_CONFIGS } from '../config/routes';

const ProjectPage = lazy(() => import('../pages/project/index'));
const SettingsPage = lazy(() => import('../pages/settings/index'));
const TerminalPage = lazy(() => import('../pages/terminal/index'));
const WelcomePage = lazy(() => import('../pages/welcome/index'));

function PageLoading() {
	return (
		<div
			className='page-loading h-full flex items-center justify-center text-sm text-muted-foreground'
			role='status'>
			页面加载中...
		</div>
	);
}

export const AppRouter = () => {
	return (
		<Suspense fallback={<PageLoading />}>
			<Routes>
				<Route
					path='/'
					element={<Navigate to={PAGE_CONFIGS.projects.path} replace />}
				/>
				<Route path={PAGE_CONFIGS.welcome.path} element={<WelcomePage />} />
				<Route path={PAGE_CONFIGS.projects.path} element={<ProjectPage />} />
				<Route path={PAGE_CONFIGS.settings.path} element={<SettingsPage />} />
				<Route path={PAGE_CONFIGS.terminal.path} element={<TerminalPage />} />
				<Route
					path='*'
					element={<Navigate to={PAGE_CONFIGS.projects.path} replace />}
				/>
			</Routes>
		</Suspense>
	);
};
