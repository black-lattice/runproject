import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Webview from '@/components/Webview';
import URLInput from '@/pages/browser/URLInput';
import TabsBar from '@/pages/browser/TabsBar';
import HomePage from '@/pages/browser/HomePage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog';
import { listen } from '@tauri-apps/api/event';

function BrowserPage() {
	const DEFAULT_HOME_URL = 'https://www.bing.com/';
	const HOME_TAB_ID = 'home';
	const [tabs, setTabs] = useState(() => [
		{
			id: `${Date.now()}`,
			desiredUrl: DEFAULT_HOME_URL,
			currentUrl: DEFAULT_HOME_URL
		}
	]);
	const [activeTabId, setActiveTabId] = useState(tabs[0].id);

	const activeTab = useMemo(
		() => tabs.find(t => t.id === activeTabId) || tabs[0],
		[tabs, activeTabId]
	);
	const isHomeActive = activeTabId === HOME_TAB_ID;
	const currentUrl = isHomeActive ? '' : activeTab?.currentUrl || '';

	const { homeSites, addHomeSite, removeHomeSite, updateHomeSite } = useAppStore();
	const [editingSite, setEditingSite] = useState(null);
	const [editTitle, setEditTitle] = useState('');
	const [editUrl, setEditUrl] = useState('');
	const [deletingSiteId, setDeletingSiteId] = useState(null);

	const guessTitleFromUrl = rawUrl => {
		if (!rawUrl) return '';
		try {
			const u = new URL(rawUrl);
			return u.hostname || rawUrl;
		} catch {
			return rawUrl;
		}
	};

	const openEdit = site => {
		setEditingSite(site);
		setEditTitle(site?.title || '');
		setEditUrl(site?.url || '');
	};

	const handleUrlChange = url => {
		if (isHomeActive) {
			createTab(url);
			return;
		}
		setTabs(prev =>
			prev.map(t =>
				t.id === activeTabId
					? { ...t, desiredUrl: url, currentUrl: url }
					: t
			)
		);
	};

	const createTab = (url = DEFAULT_HOME_URL) => {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		setTabs(prev => [...prev, { id, desiredUrl: url, currentUrl: url }]);
		setActiveTabId(id);
	};

	// 只响应用户点击触发的新窗口请求（target=_blank / window.open）：更新显示 URL（不驱动导航）
	useEffect(() => {
		let unlistenClick;
		let unlistenUrlChanged;
		(async () => {
			unlistenClick = await listen('browser:user-click', event => {
				const payload = event.payload || {};
				const label = typeof payload.label === 'string' ? payload.label : '';
				const url = typeof payload.url === 'string' ? payload.url : '';
				if (!label || !url) return;

				setTabs(prev =>
					prev.map(t => {
						const tLabel = `browser-webview-${t.id}`;
						if (tLabel !== label) return t;
						if (t.currentUrl === url) return t;
						return { ...t, currentUrl: url };
					})
				);
			});

			unlistenUrlChanged = await listen('browser:url-changed', event => {
				const payload = event.payload || {};
				const label = typeof payload.label === 'string' ? payload.label : '';
				const url = typeof payload.url === 'string' ? payload.url : '';
				if (!label || !url) return;

				setTabs(prev =>
					prev.map(t => {
						const tLabel = `browser-webview-${t.id}`;
						if (tLabel !== label) return t;
						if (t.currentUrl === url) return t;
						return { ...t, currentUrl: url };
					})
				);
			});
		})();
		return () => {
			if (typeof unlistenClick === 'function') unlistenClick();
			if (typeof unlistenUrlChanged === 'function') unlistenUrlChanged();
		};
	}, []);

	const closeTab = id => {
		setTabs(prev => {
			const next = prev.filter(t => t.id !== id);
			if (next.length === 0) {
				const newId = `${Date.now()}`;
				setActiveTabId(HOME_TAB_ID);
				return [
					{
						id: newId,
						desiredUrl: DEFAULT_HOME_URL,
						currentUrl: DEFAULT_HOME_URL
					}
				];
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
					favoriteDefaultTitle={guessTitleFromUrl(currentUrl)}
					onFavoriteSubmit={title => {
						if (!currentUrl) return;
						addHomeSite({ title, url: currentUrl });
					}}
				/>

				<TabsBar
					isHomeActive={isHomeActive}
					tabs={tabs}
					activeTabId={activeTabId}
					onGoHome={() => setActiveTabId(HOME_TAB_ID)}
					onSelectTab={setActiveTabId}
					onCloseTab={closeTab}
					onNewTab={() => createTab()}
				/>

				<div className='flex-1 min-h-0'>
					{isHomeActive ? (
						<HomePage
							sites={homeSites}
							onOpenSite={url => createTab(url)}
							onEditSite={site => openEdit(site)}
							onDeleteSite={id => setDeletingSiteId(id)}
						/>
					) : (
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
										url={t.desiredUrl}
										isVisible={t.id === activeTabId}
									/>
								</div>
							))}
						</div>
					)}
				</div>

				<Dialog
					open={!!editingSite}
					onOpenChange={open => {
						if (!open) setEditingSite(null);
					}}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>编辑网站</DialogTitle>
						</DialogHeader>
						<div className='p-4 space-y-3'>
							<Input
								placeholder='名称'
								value={editTitle}
								onChange={e => setEditTitle(e.target.value)}
							/>
							<Input
								placeholder='URL'
								value={editUrl}
								onChange={e => setEditUrl(e.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => setEditingSite(null)}>
								取消
							</Button>
							<Button
								disabled={!editTitle.trim() || !editUrl.trim()}
								onClick={() => {
									updateHomeSite(editingSite.id, {
										title: editTitle.trim(),
										url: editUrl.trim()
									});
									setEditingSite(null);
								}}>
								保存
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog
					open={!!deletingSiteId}
					onOpenChange={open => {
						if (!open) setDeletingSiteId(null);
					}}>
					<DialogContent className='max-w-sm'>
						<DialogHeader>
							<DialogTitle>确认删除</DialogTitle>
						</DialogHeader>
						<div className='p-4 text-sm text-gray-600'>确定删除该网站？</div>
						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => setDeletingSiteId(null)}>
								取消
							</Button>
							<Button
								variant='destructive'
								onClick={() => {
									removeHomeSite(deletingSiteId);
									setDeletingSiteId(null);
								}}>
								删除
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}

export default BrowserPage;
