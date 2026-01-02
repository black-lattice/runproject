import { useEffect, useRef, useState } from 'react';
import { Layout } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

function Webview({ label, url, isVisible = true }) {
	const webviewLabelRef = useRef(label);
	const containerRef = useRef(null);
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState(null);
	const shouldCreateWebviewRef = useRef(false);
	const rafIdRef = useRef(null);

	const normalizeRect = rect => {
		return {
			x: Math.round(rect.left),
			y: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height)
		};
	};

	const getBounds = () => {
		const el = containerRef.current;
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return normalizeRect(rect);
	};

	const scheduleUpdateBounds = () => {
		if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
		rafIdRef.current = requestAnimationFrame(async () => {
			if (!isVisible) return;
			const bounds = getBounds();
			if (!bounds) return;
			const { x, y, width, height } = bounds;
			if (width <= 0 || height <= 0) return;

			try {
				if (!isReady) {
					await setupWebview(bounds);
				} else {
					await invoke('show_webview', {
						label: webviewLabelRef.current
					});
					await invoke('resize_webview', {
						label: webviewLabelRef.current,
						x,
						y,
						width,
						height
					});
				}
			} catch (err) {
				console.error('Failed to update webview bounds:', err);
			}
		});
	};

	const setupWebview = async overrideBounds => {
		try {
			const window = getCurrentWindow();
			const label = webviewLabelRef.current;

			const bounds = overrideBounds || getBounds();
			if (!bounds) {
				throw new Error('Webview container not found');
			}

			const { x, y, width, height } = bounds;

			console.log('Creating webview:', {
				x,
				y,
				width,
				height,
				url: url || 'about:blank'
			});

			if (width <= 0 || height <= 0) {
				throw new Error('Webview container has no size');
			}

			await invoke('create_child_webview', {
				window,
				label,
				url: url || 'about:blank',
				x,
				y,
				width,
				height
			});

			console.log('Webview created successfully');
			setIsReady(true);
			setError(null);
		} catch (err) {
			console.error('Failed to create webview:', err);
			setError(err.message || 'Failed to create webview');
		}
	};

	const handleContainerRef = el => {
		containerRef.current = el;
		if (el && shouldCreateWebviewRef.current && isVisible) {
			shouldCreateWebviewRef.current = false;
			scheduleUpdateBounds();
		}
	};

	useEffect(() => {
		shouldCreateWebviewRef.current = true;
		const timer = requestAnimationFrame(() => scheduleUpdateBounds());
		return () => {
			cancelAnimationFrame(timer);
		};
	}, [isVisible, isReady]);

	// 组件卸载才真正关闭 webview（用于关闭 tab）
	useEffect(() => {
		return () => {
			if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
			const cleanup = async () => {
				try {
					await invoke('close_webview', {
						label: webviewLabelRef.current
					});
				} catch (err) {
					console.error('Failed to close webview:', err);
				}
			};
			cleanup();
		};
	}, []);

	// 可见性切换：隐藏/显示，避免隐藏的 native webview 仍覆盖交互区域
	useEffect(() => {
		if (!isReady) return;
		const run = async () => {
			try {
				if (isVisible) {
					await invoke('show_webview', { label: webviewLabelRef.current });
					scheduleUpdateBounds();
				} else {
					await invoke('hide_webview', { label: webviewLabelRef.current });
				}
			} catch (err) {
				console.error('Failed to toggle webview visibility:', err);
			}
		};
		run();
	}, [isVisible, isReady]);

	useEffect(() => {
		if (!containerRef.current) return;

		const el = containerRef.current;
		let ro;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => {
				if (isVisible) scheduleUpdateBounds();
			});
			ro.observe(el);
		}

		const onWindowResize = () => {
			if (isVisible) scheduleUpdateBounds();
		};
		const onScroll = () => {
			if (isVisible) scheduleUpdateBounds();
		};
		window.addEventListener('resize', onWindowResize);
		window.addEventListener('scroll', onScroll, true);

		return () => {
			if (ro) ro.disconnect();
			window.removeEventListener('resize', onWindowResize);
			window.removeEventListener('scroll', onScroll, true);
		};
	}, [isVisible, isReady]);

	useEffect(() => {
		if (!url || !isReady) return;

		const navigate = async () => {
			try {
				await invoke('navigate_webview', {
					label: webviewLabelRef.current,
					url
				});
				setError(null);
			} catch (err) {
				console.error('Failed to navigate:', err);
				setError(err.message || 'Failed to navigate');
			}
		};

		navigate();
	}, [url, isReady]);

	return (
		<div className='h-full w-full relative'>
			<div
				ref={handleContainerRef}
				className='h-full w-full'
				style={{ position: 'absolute', top: 0, left: 0 }}
			/>

			{!isVisible && (
				<div className='h-full flex items-center justify-center bg-gray-50'>
					<div className='text-center'>
						<div className='bg-gray-100 p-4 rounded-full w-fit mx-auto mb-4'>
							<Layout className='h-10 w-10 text-gray-400' />
						</div>
						<p className='text-gray-500 mb-4 font-medium'>输入 URL 开始浏览</p>
						<p className='text-xs text-gray-400'>支持本地开发地址（如 localhost:3000）</p>
					</div>
				</div>
			)}

			{isVisible && !isReady && !error && (
				<div className='h-full flex items-center justify-center bg-gray-50'>
					<div className='text-center'>
						<div className='bg-blue-100 p-4 rounded-full w-fit mx-auto mb-4'>
							<svg
								className='h-10 w-10 text-blue-500 animate-spin'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
								/>
							</svg>
						</div>
						<p className='text-gray-700 mb-2 font-medium'>正在加载...</p>
						<p className='text-xs text-gray-500'>{url}</p>
					</div>
				</div>
			)}

			{isVisible && error && (
				<div className='h-full flex items-center justify-center bg-gray-50'>
					<div className='text-center'>
						<div className='bg-red-100 p-4 rounded-full w-fit mx-auto mb-4'>
							<svg
								className='h-10 w-10 text-red-500'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
								/>
							</svg>
						</div>
						<p className='text-red-700 mb-2 font-medium'>加载失败</p>
						<p className='text-xs text-red-500'>{error}</p>
					</div>
				</div>
			)}
		</div>
	);
}

export default Webview;
