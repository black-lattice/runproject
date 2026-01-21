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
import MassageWebPage from '../pages/micro-apps/MassageWeb';
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
				path={PAGE_CONFIGS['massage-web'].path}
				element={<MassageWebPage />}
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
