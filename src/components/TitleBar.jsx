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
			// 只在标题栏区域触发拖拽，不包含可交互元素
			if (e.target.closest('[data-tauri-drag-region]')) {
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
		<div className='flex items-center h-[32px] flex-shrink-0 select-none overflow-hidden'>
			{/* macOS 原生控制按钮区域（红/黄/绿按钮）- Overlay 模式下原生按钮已存在 */}
			<div
				className='w-20 h-full flex-shrink-0 bg-white'
				data-tauri-drag-region
			/>

			{/* 标题栏内容区域（包含 TabBar） */}
			<div className='flex-1 overflow-hidden'>{children}</div>

			{/* 右侧拖拽区域 */}
			<div
				className='w-8 h-full flex-shrink-0 bg-white'
				data-tauri-drag-region
			/>
		</div>
	);
}

export default TitleBar;
