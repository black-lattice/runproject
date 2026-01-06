import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 自定义标题栏组件
 * 功能：
 * 1. 提供窗口拖拽功能
 * 2. 预留 macOS 原生控制按钮区域（红/黄/绿按钮）
 * 3. 包含 TabBar 组件作为标题栏内容
 */
function TitleBar({ children }) {
	const titleBarRef = useRef(null);

	useEffect(() => {
		const handleMouseDown = async e => {
			const dragRegion = e.target.closest('[data-tauri-drag-region]');
			if (dragRegion) {
				const window = getCurrentWindow();
				await window.startDragging();
			}
		};

		const titleBar = titleBarRef.current;
		if (titleBar) {
			titleBar.addEventListener('mousedown', handleMouseDown);
		}

		return () => {
			if (titleBar) {
				titleBar.removeEventListener('mousedown', handleMouseDown);
			}
		};
	}, []);

	return (
		<div
			ref={titleBarRef}
			className='flex items-center h-[32px] flex-shrink-0 select-none overflow-hidden border-b border-gray-200'
		>
			{/* macOS 原生控制按钮区域（红/黄/绿按钮）- Overlay 模式下原生按钮已存在 */}
			<div
				className='w-20 h-full flex-shrink-0 bg-white'
				data-tauri-drag-region
			/>

			{/* 标题栏内容区域（包含 TabBar）- 宽度根据内容自动撑大 */}
			<div className='overflow-hidden'>{children}</div>

			{/* 右侧拖拽区域 - 占据剩余空间 */}
			<div className='flex-1 h-full bg-white' data-tauri-drag-region />
		</div>
	);
}

export default TitleBar;
