import {
	HashRouter as Router,
	Routes,
	Route,
	Navigate
} from 'react-router-dom';
import WelcomePage from '../pages/welcome/index';
import ProjectPage from '../pages/project/index';
import SettingsPage from '../pages/settings/index';
import TerminalPage from '../pages/terminal/index';
import FormatterPage from '../pages/formatter/index';
import BrowserPage from '../pages/browser/index';
import KnowledgePage from '../pages/knowledge/index';
import KnowledgeDetailPage from '../pages/knowledge/detail';
import { PAGE_CONFIGS } from '../config/routes';

export const AppRouter = () => {
	return (
		<Routes>
			<Route
				path='/'
				element={
					<Navigate
						to={PAGE_CONFIGS.welcome.path}
						replace
					/>
				}
			/>
			<Route
				path={PAGE_CONFIGS.welcome.path}
				element={<WelcomePage />}
			/>
			<Route
				path={PAGE_CONFIGS.projects.path}
				element={<ProjectPage />}
			/>
			<Route
				path={PAGE_CONFIGS.settings.path}
				element={<SettingsPage />}
			/>
			<Route
				path={PAGE_CONFIGS.terminal.path}
				element={<TerminalPage />}
			/>
			<Route
				path={PAGE_CONFIGS.formatter.path}
				element={<FormatterPage />}
			/>
			<Route
				path={PAGE_CONFIGS.browser.path}
				element={<BrowserPage />}
			/>
			<Route
				path={PAGE_CONFIGS.knowledge.path}
				element={<KnowledgePage />}
			/>
			<Route
				path='/knowledge/:topicId'
				element={<KnowledgeDetailPage />}
			/>
			<Route
				path='*'
				element={
					<Navigate
						to={PAGE_CONFIGS.welcome.path}
						replace
					/>
				}
			/>
		</Routes>
	);
};
