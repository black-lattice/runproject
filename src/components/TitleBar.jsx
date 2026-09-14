import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NavLink } from 'react-router-dom';
import { PAGE_CONFIGS } from '../config/routes';
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
	const SettingsIcon = PAGE_CONFIGS.settings.icon;

	useEffect(() => {
		const handleMouseDown = async e => {
			if (e.button !== 0) return;

			// 菜单和表单控件保留原生点击行为，不触发窗口拖动。
			const interactiveTarget = e.target.closest(
				'button, a, input, textarea, select, [role="button"], [role="menuitem"], .ant-menu-item',
			);
			const dragRegion = e.target.closest('[data-tauri-drag-region]');
			if (dragRegion && !interactiveTarget) {
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
			<div
				className='app-titlebar-content min-w-0 flex-1 overflow-hidden'
				data-tauri-drag-region>
				{children}
			</div>

			<NavLink
				to={PAGE_CONFIGS.settings.path}
				aria-label='设置'
				title='设置'
				className={({ isActive }) =>
					`mx-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
				}>
				<SettingsIcon className='text-base' />
			</NavLink>
		</div>
	);
}

export default TitleBar;
