function getTabTitle(url) {
	if (!url) return '新标签';
	try {
		const u = new URL(url);
		return u.hostname || url;
	} catch {
		return url;
	}
}

function TabsBar({
	isHomeActive,
	tabs,
	activeTabId,
	onGoHome,
	onSelectTab,
	onCloseTab,
	onNewTab
}) {
	return (
		<div className='flex items-center gap-2 px-3 py-2 border-b bg-white'>
			<div className='flex items-center gap-2 min-w-0 flex-1'>
				<button
					className={`px-3 py-1 rounded text-sm border whitespace-nowrap ${isHomeActive
							? 'bg-blue-50 border-blue-400 text-blue-700'
							: 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
						}`}
					onClick={onGoHome}>
					Home
				</button>

				<div className='flex items-center gap-1 overflow-x-auto min-w-0'>
					{tabs.map(t => (
						<button
							key={t.id}
							className={`px-3 py-1 rounded text-sm border whitespace-nowrap ${t.id === activeTabId
									? 'bg-blue-50 border-blue-400 text-blue-700'
									: 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
								}`}
							onClick={() => onSelectTab(t.id)}>
							<span className='mr-2'>{getTabTitle(t.currentUrl || t.desiredUrl)}</span>
							<span
								className='ml-1 text-gray-400 hover:text-red-500'
								onClick={e => {
									e.stopPropagation();
									onCloseTab(t.id);
								}}>
								×
							</span>
						</button>
					))}
				</div>

				<button
					className='px-3 py-1 rounded text-sm border border-gray-200 hover:bg-gray-50 flex-shrink-0'
					onClick={onNewTab}>
					新建
				</button>
			</div>
		</div>
	);
}

export default TabsBar;


