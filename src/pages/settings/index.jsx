import { useState } from 'react';
import { Settings, Terminal, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

import { TerminalSettings } from './coms/TerminalSettings';
import { AboutSettings } from './coms/AboutSettings';

const NAV_ITEMS = [
	{
		id: 'terminal',
		label: '终端设置',
		icon: Terminal,
		component: TerminalSettings
	},
	{ id: 'about', label: '关于', icon: Info, component: AboutSettings }
];

function SettingsPage() {
	const [activeSection, setActiveSection] = useState('terminal');

	const ActiveComponent =
		NAV_ITEMS.find(item => item.id === activeSection)?.component ||
		TerminalSettings;

	return (
		<div className='h-full flex bg-gray-50'>
			{/* Sidebar Navigation */}
			<aside className='w-64 bg-white border-r border-gray-200 flex flex-col'>
				<div className='p-6 border-b border-gray-100'>
					<h1 className='text-xl font-bold text-gray-900 flex items-center gap-2'>
						<Settings className='h-5 w-5 text-gray-500' />
						设置
					</h1>
					<p className='text-xs text-gray-500 mt-1'>配置应用程序偏好</p>
				</div>
				<ScrollArea className='flex-1 py-4'>
					<nav className='space-y-1 px-2'>
						{NAV_ITEMS.map(item => {
							const Icon = item.icon;
							return (
								<button
									key={item.id}
									onClick={() => setActiveSection(item.id)}
									className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
										activeSection === item.id
											? 'bg-emerald-50 text-emerald-700'
											: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
									}`}>
									<Icon
										className={`h-4 w-4 ${activeSection === item.id ? 'text-emerald-600' : 'text-gray-400'}`}
									/>
									{item.label}
								</button>
							);
						})}
					</nav>
				</ScrollArea>
			</aside>

			{/* Main Content Area */}
			<main className='flex-1 flex flex-col min-w-0 overflow-hidden'>
				<ScrollArea className='flex-1'>
					<div className='w-full px-6 py-8 xl:px-8'>
						<div className='mb-6'>
							<h2 className='text-2xl font-bold text-gray-900'>
								{NAV_ITEMS.find(item => item.id === activeSection)?.label}
							</h2>
						</div>
						<div className='animate-in fade-in slide-in-from-bottom-4 duration-500'>
							<ActiveComponent />
						</div>
					</div>
				</ScrollArea>
			</main>
		</div>
	);
}

export default SettingsPage;
