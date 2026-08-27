import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AppLogo from './AppLogo';

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
			className='app-titlebar flex items-center h-[36px] flex-shrink-0 select-none overflow-hidden border-b'>
			{/* macOS 原生控制按钮区域（红/黄/绿按钮）- Overlay 模式下原生按钮已存在 */}
			<div
				className='app-titlebar-surface w-20 h-full flex-shrink-0'
				data-tauri-drag-region
			/>

			<div
				className='app-titlebar-surface h-full flex items-center pr-2'
				data-tauri-drag-region>
				<AppLogo className='block h-5 w-5 flex-shrink-0' />
			</div>

			{/* 标题栏内容区域（包含 TabBar）- 宽度根据内容自动撑大 */}
			<div className='overflow-hidden'>{children}</div>

			{/* 右侧拖拽区域 - 占据剩余空间 */}
			<div className='app-titlebar-surface flex-1 h-full' data-tauri-drag-region />
		</div>
	);
}

export default TitleBar;
