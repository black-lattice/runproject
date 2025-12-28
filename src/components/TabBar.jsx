import { useNavigate, useLocation } from 'react-router-dom';
import { X, Home } from 'lucide-react';
import { Button } from './ui/button';
import { useAppStore } from '../store/useAppStore';
import { PAGE_CONFIGS } from '../config/routes';
import { cn } from '@/lib/utils';

function TabBar() {
	const navigate = useNavigate();
	const location = useLocation();
	const { tabs, closeTab } = useAppStore();

	// 根据当前 path 计算 activeTab
	const activeTab = Object.values(PAGE_CONFIGS).find(c => c.path === location.pathname)?.id || 'welcome';

	const handleTabClick = (tabId) => {
		if (PAGE_CONFIGS[tabId]) {
			navigate(PAGE_CONFIGS[tabId].path);
		}
	};

	const handleTabClose = (tabId, event) => {
		event.stopPropagation();

		// 如果关闭的是当前页，需要跳转
		if (activeTab === tabId) {
			const currentIndex = tabs.indexOf(tabId);
			// 尝试跳转到后一个，如果没有则前一个，如果都没有则 welcome
			let nextTabId = 'welcome';

			// 注意：此时 tabs 还没更新，包含即将被关闭的 tab
			if (tabs.length > 1) {
				if (currentIndex === tabs.length - 1) {
					// 关闭的是最后一个，跳到前一个
					nextTabId = tabs[currentIndex - 1];
				} else {
					// 跳到后一个
					nextTabId = tabs[currentIndex + 1];
				}
			}

			if (PAGE_CONFIGS[nextTabId]) {
				navigate(PAGE_CONFIGS[nextTabId].path);
			}
		}

		closeTab(tabId);
	};

	return (
		<div className='flex items-center bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto gap-1 h-12 flex-shrink-0'>
			{/* 固定 Home 标签 */}
			<div
				className={cn(
					"flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-colors border select-none min-w-fit",
					activeTab === 'welcome'
						? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm'
						: 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100'
				)}
				onClick={() => handleTabClick('welcome')}
			>
				<Home className="w-4 h-4 mr-2" />
				<span className='text-sm font-medium'>首页</span>
			</div>

			{/* 分隔线 */}
			{tabs.length > 0 && <div className="w-px h-5 bg-gray-300 mx-2" />}

			{/* 动态标签 */}
			<div className="flex gap-1 overflow-x-auto no-scrollbar">
				{tabs.map(tabId => {
					const config = PAGE_CONFIGS[tabId];
					if (!config) return null;

					const isActive = activeTab === tabId;
					const Icon = config.icon;

					return (
						<div
							key={tabId}
							className={cn(
								"flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-colors border select-none group min-w-fit",
								isActive
									? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm'
									: 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100'
							)}
							onClick={() => handleTabClick(tabId)}
						>
							{Icon && <Icon className="w-4 h-4 mr-2 opacity-70" />}
							<span className='text-sm font-medium whitespace-nowrap'>
								{config.title}
							</span>
							{config.closable && (
								<Button
									variant='ghost'
									size='sm'
									className={cn(
										"ml-2 h-4 w-4 p-0 hover:bg-red-200 hover:text-red-700 rounded-full transition-all duration-200",
										isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70"
									)}
									onClick={e => handleTabClose(tabId, e)}
								>
									<X className='h-3 w-3' />
								</Button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default TabBar;
