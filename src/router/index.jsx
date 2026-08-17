import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WelcomePage from '../pages/welcome/index';
import { PAGE_CONFIGS } from '../config/routes';

const ProjectPage = lazy(() => import('../pages/project/index'));
const SettingsPage = lazy(() => import('../pages/settings/index'));
const TerminalPage = lazy(() => import('../pages/terminal/index'));
const FormatterPage = lazy(() => import('../pages/formatter/index'));

function PageLoading() {
	return (
		<div
			className='h-full flex items-center justify-center text-sm text-gray-500'
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
					element={<Navigate to={PAGE_CONFIGS.welcome.path} replace />}
				/>
				<Route path={PAGE_CONFIGS.welcome.path} element={<WelcomePage />} />
				<Route path={PAGE_CONFIGS.projects.path} element={<ProjectPage />} />
				<Route path={PAGE_CONFIGS.settings.path} element={<SettingsPage />} />
				<Route path={PAGE_CONFIGS.terminal.path} element={<TerminalPage />} />
				<Route path={PAGE_CONFIGS.formatter.path} element={<FormatterPage />} />
				<Route
					path='*'
					element={<Navigate to={PAGE_CONFIGS.welcome.path} replace />}
				/>
			</Routes>
		</Suspense>
	);
};
