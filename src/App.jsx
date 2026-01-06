import { HashRouter as Router } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import { AppRouter } from './router';

function App() {
	return (
		<Router>
			<div className='h-screen flex flex-col overflow-hidden bg-gray-100'>
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
