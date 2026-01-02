import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Webview from '@/components/Webview';
import URLInput from '@/pages/browser/URLInput';
import BookmarkList from '@/pages/browser/BookmarkList';

function BrowserPage() {
	const DEFAULT_HOME_URL = 'https://www.bing.com/';
	const [tabs, setTabs] = useState(() => [
		{
			id: `${Date.now()}`,
			url: DEFAULT_HOME_URL
		}
	]);
	const [activeTabId, setActiveTabId] = useState(tabs[0].id);

	const activeTab = useMemo(
		() => tabs.find(t => t.id === activeTabId) || tabs[0],
		[tabs, activeTabId]
	);
	const currentUrl = activeTab?.url || '';

	const { bookmarks, addBookmark, removeBookmark } = useAppStore();

	const handleUrlChange = url => {
		setTabs(prev =>
			prev.map(t => (t.id === activeTabId ? { ...t, url } : t))
		);
	};

	const handleBookmarkClick = bookmark => {
		handleUrlChange(bookmark.url);
	};

	const handleAddBookmark = bookmark => {
		addBookmark(bookmark);
	};

	const handleRemoveBookmark = bookmarkId => {
		removeBookmark(bookmarkId);
	};

	const createTab = (url = DEFAULT_HOME_URL) => {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		setTabs(prev => [...prev, { id, url }]);
		setActiveTabId(id);
	};

	const closeTab = id => {
		setTabs(prev => {
			const next = prev.filter(t => t.id !== id);
			if (next.length === 0) {
				const newId = `${Date.now()}`;
				setActiveTabId(newId);
				return [{ id: newId, url: DEFAULT_HOME_URL }];
			}
			if (id === activeTabId) {
				setActiveTabId(next[0].id);
			}
			return next;
		});
	};

	return (
		<div className='h-full flex flex-col bg-white'>
			<div className='flex-1 flex flex-col min-h-0'>
				<URLInput
					url={currentUrl}
					onUrlChange={handleUrlChange}
				/>

				<div className='flex items-center gap-2 px-3 py-2 border-b bg-white'>
					<div className='flex items-center gap-2 min-w-0 flex-1'>
						<div className='flex items-center gap-1 overflow-x-auto min-w-0'>
							{tabs.map(t => (
								<button
									key={t.id}
									className={`px-3 py-1 rounded text-sm border whitespace-nowrap ${t.id === activeTabId
										? 'bg-blue-50 border-blue-400 text-blue-700'
										: 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
										}`}
									onClick={() => setActiveTabId(t.id)}>
									<span className='mr-2'>标签页</span>
									<span
										className='ml-1 text-gray-400 hover:text-red-500'
										onClick={e => {
											e.stopPropagation();
											closeTab(t.id);
										}}>
										×
									</span>
								</button>
							))}
						</div>

						<button
							className='px-3 py-1 rounded text-sm border border-gray-200 hover:bg-gray-50 flex-shrink-0'
							onClick={() => createTab()}>
							新建
						</button>
					</div>
				</div>

				<div className='flex-1 flex min-h-0'>
					<div className='flex-1 min-w-0'>
						<div className='h-full w-full relative'>
							{tabs.map(t => (
								<div
									key={t.id}
									className='absolute inset-0'
									style={{
										visibility:
											t.id === activeTabId ? 'visible' : 'hidden'
									}}>
									<Webview
										label={`browser-webview-${t.id}`}
										url={t.url}
										isVisible={t.id === activeTabId}
									/>
								</div>
							))}
						</div>
					</div>

					<div className='w-80 border-l flex flex-col'>
						<BookmarkList
							bookmarks={bookmarks}
							currentUrl={currentUrl}
							onBookmarkClick={handleBookmarkClick}
							onRemoveBookmark={handleRemoveBookmark}
							onAddBookmark={handleAddBookmark}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

export default BrowserPage;
