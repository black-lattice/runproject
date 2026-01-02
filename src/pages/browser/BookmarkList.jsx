import { useState } from 'react';
import { Star, Trash2, Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

function BookmarkList({ bookmarks, currentUrl, onBookmarkClick, onRemoveBookmark, onAddBookmark }) {
	const [isExpanded, setIsExpanded] = useState(true);
	const [newBookmarkTitle, setNewBookmarkTitle] = useState('');

	const isCurrentUrlBookmarked = bookmarks.some(b => b.url === currentUrl);

	const handleAddBookmark = () => {
		if (currentUrl && !isCurrentUrlBookmarked) {
			onAddBookmark({
				url: currentUrl,
				title: newBookmarkTitle || currentUrl
			});
			setNewBookmarkTitle('');
		}
	};

	const isLocalhost = url => {
		return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0');
	};

	const groupedBookmarks = bookmarks.reduce((acc, bookmark) => {
		const key = isLocalhost(bookmark.url) ? 'local' : 'remote';
		if (!acc[key]) {
			acc[key] = [];
		}
		acc[key].push(bookmark);
		return acc;
	}, {});

	return (
		<div className='border-t bg-white'>
			<div
				className='flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50'
				onClick={() => setIsExpanded(!isExpanded)}>
				<div className='flex items-center gap-2'>
					<Star className='h-4 w-4 text-yellow-500' />
					<span className='font-medium text-sm'>收藏夹</span>
					<Badge variant='secondary' className='text-xs'>
						{bookmarks.length}
					</Badge>
				</div>
				{isExpanded ? (
					<ChevronUp className='h-4 w-4 text-gray-400' />
				) : (
					<ChevronDown className='h-4 w-4 text-gray-400' />
				)}
			</div>

			{isExpanded && (
				<div className='px-3 pb-3'>
					{currentUrl && !isCurrentUrlBookmarked && (
						<div className='mb-3 p-2 bg-blue-50 rounded-lg'>
							<div className='flex items-center gap-2'>
								<input
									type='text'
									placeholder='收藏标题(可选)'
									value={newBookmarkTitle}
									onChange={e => setNewBookmarkTitle(e.target.value)}
									className='flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500'
								/>
								<Button size='sm' onClick={handleAddBookmark}>
									<Star className='h-4 w-4 mr-1' />
									收藏
								</Button>
							</div>
						</div>
					)}

					<ScrollArea className='h-48'>
						{Object.keys(groupedBookmarks).length === 0 ? (
							<div className='text-center py-8 text-gray-400 text-sm'>
								暂无收藏
							</div>
						) : (
							<div className='space-y-3'>
								{groupedBookmarks.local && groupedBookmarks.local.length > 0 && (
									<div>
										<div className='text-xs font-medium text-gray-500 mb-2 px-1'>
											本地项目
										</div>
										{groupedBookmarks.local.map(bookmark => (
											<BookmarkItem
												key={bookmark.id}
												bookmark={bookmark}
												isActive={bookmark.url === currentUrl}
												onClick={() => onBookmarkClick(bookmark)}
												onRemove={() => onRemoveBookmark(bookmark.id)}
											/>
										))}
									</div>
								)}

								{groupedBookmarks.remote && groupedBookmarks.remote.length > 0 && (
									<div>
										<div className='text-xs font-medium text-gray-500 mb-2 px-1'>
											线上网站
										</div>
										{groupedBookmarks.remote.map(bookmark => (
											<BookmarkItem
												key={bookmark.id}
												bookmark={bookmark}
												isActive={bookmark.url === currentUrl}
												onClick={() => onBookmarkClick(bookmark)}
												onRemove={() => onRemoveBookmark(bookmark.id)}
											/>
										))}
									</div>
								)}
							</div>
						)}
					</ScrollArea>
				</div>
			)}
		</div>
	);
}

function BookmarkItem({ bookmark, isActive, onClick, onRemove }) {
	const isLocalhost = bookmark.url.includes('localhost') || bookmark.url.includes('127.0.0.1');

	return (
		<Card
			className={`p-2 cursor-pointer transition-all hover:shadow-md ${
				isActive ? 'border-blue-500 bg-blue-50' : ''
			}`}
			onClick={onClick}>
			<div className='flex items-start justify-between gap-2'>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 mb-1'>
						{isLocalhost ? (
							<Globe className='h-3 w-3 text-green-500 flex-shrink-0' />
						) : (
							<ExternalLink className='h-3 w-3 text-blue-500 flex-shrink-0' />
						)}
						<span className='text-sm font-medium truncate'>{bookmark.title}</span>
					</div>
					<p className='text-xs text-gray-500 truncate font-mono'>
						{bookmark.url}
					</p>
				</div>
				<Button
					variant='ghost'
					size='sm'
					className='h-6 w-6 p-0 flex-shrink-0'
					onClick={e => {
						e.stopPropagation();
						onRemove();
					}}>
					<Trash2 className='h-3 w-3 text-gray-400 hover:text-red-500' />
				</Button>
			</div>
		</Card>
	);
}

export default BookmarkList;
