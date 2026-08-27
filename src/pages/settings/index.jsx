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
		<div className='settings-page h-full flex'>
			{/* Sidebar Navigation */}
			<aside className='settings-sidebar w-64 border-r flex flex-col'>
				<div className='p-6 border-b border-border/80'>
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
									className={`settings-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
										activeSection === item.id
											? 'settings-nav-item-active'
											: ''
									}`}>
									<Icon
										className={`h-4 w-4 ${activeSection === item.id ? 'text-primary' : 'text-gray-400'}`}
									/>
									{item.label}
								</button>
							);
						})}
					</nav>
				</ScrollArea>
			</aside>

			{/* Main Content Area */}
			<main className='settings-content flex-1 flex flex-col min-w-0 overflow-hidden'>
				<ScrollArea className='flex-1'>
					<div className='w-full max-w-4xl px-6 py-8 xl:px-10'>
						<div className='mb-6'>
							<h2 className='text-2xl font-bold text-gray-900 tracking-tight'>
								{NAV_ITEMS.find(item => item.id === activeSection)?.label}
							</h2>
						</div>
						<div className='animate-in fade-in slide-in-from-bottom-2 duration-300'>
							<ActiveComponent />
						</div>
					</div>
				</ScrollArea>
			</main>
		</div>
	);
}

export default SettingsPage;
