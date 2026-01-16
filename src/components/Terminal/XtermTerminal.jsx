import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

const XtermTerminal = ({
	sessionId,
	cwd,
	onClose,
	existingSession = false
}) => {
	const containerRef = useRef(null);
	const terminalRef = useRef(null);
	const fitAddonRef = useRef(null);
	const reconnectingRef = useRef(false);
	const closedRef = useRef(false);

	useEffect(() => {
		console.log(
			`XtermTerminal useEffect 运行: sessionId=${sessionId}, existingSession=${existingSession}`
		);

		if (!containerRef.current) return;

		closedRef.current = false;
		reconnectingRef.current = false;

		let unmounted = false;
		let unlistenOutput = null;
		let unlistenClose = null;
		let dataDisposable = null;
		let terminal = null;
		let fitAddon = null;
		let heartbeatTimer = null;
		const pendingChunks = [];
		let backlogLoaded = !existingSession;

		const writeEncodedChunk = encoded => {
			if (unmounted || !terminal) return;
			try {
				const decoded = atob(encoded);
				const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
				const text = new TextDecoder().decode(bytes);
				terminal.write(text);
			} catch (error) {
				console.error('解码输出失败:', error);
			}
		};

		// 创建终端实例
		terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: '#1e1e1e',
				foreground: '#d4d4d4',
				cursor: '#ffffff'
			},
			scrollback: 1000,
			cols: 80,
			rows: 24
		});

		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(containerRef.current);

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		// 初始化会话
		const initSession = async () => {
			try {
				// 等待 DOM 完全渲染
				await new Promise(resolve => requestAnimationFrame(resolve));

				if (unmounted) return;

				// 调整终端大小
				fitAddon.fit();

				// 创建或连接 PTY 会话
				const { cols, rows } = terminal;

				// 先建立输出监听，避免错过早期输出
				unlistenOutput = await listen(`terminal-output-${sessionId}`, event => {
					if (unmounted) return;
					if (!backlogLoaded) {
						pendingChunks.push(event.payload);
						return;
					}
					writeEncodedChunk(event.payload);
				});

				let sessionReady = false;
				if (!existingSession) {
					await invoke('create_terminal_session', {
						sessionId,
						config: { cwd, cols, rows }
					});
					sessionReady = true;
				} else {
					try {
						await invoke('resize_terminal', { sessionId, cols, rows });
						sessionReady = true;
					} catch (error) {
						console.warn('调整已存在会话大小失败:', error);
					}
				}

				if (!sessionReady) {
					await invoke('create_terminal_session', {
						sessionId,
						config: { cwd, cols, rows }
					});
				}

				if (unmounted) return;

				// 监听用户输入 - 必须在会话创建后立即注册
				dataDisposable = terminal.onData(data => {
					if (unmounted) return;
					const encoded = btoa(
						String.fromCharCode(...new TextEncoder().encode(data))
					);
					invoke('write_to_terminal', { sessionId, data: encoded }).catch(
						console.error
					);

					if (data === '\x03') {
						emit('command-interrupted', { sessionId });
					}
				});

				try {
					const buffered = await invoke('get_terminal_buffer', { sessionId });
					if (unmounted) return;
					if (buffered) {
						writeEncodedChunk(buffered);
					}
				} catch (error) {
					console.warn('获取终端历史失败:', error);
				}

				backlogLoaded = true;
				while (pendingChunks.length > 0) {
					const chunk = pendingChunks.shift();
					writeEncodedChunk(chunk);
				}

				unlistenClose = await listen(`terminal-closed-${sessionId}`, () => {
					if (unmounted) return;
					closedRef.current = true;
					terminal.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n');
					if (onClose) onClose();
				});
			} catch (error) {
				console.error('终端初始化失败:', error);
				terminal.write(`\r\n\x1b[31m错误: ${error}\x1b[0m\r\n`);
			}
		};

		const startHeartbeat = () => {
			heartbeatTimer = setInterval(async () => {
				if (unmounted || closedRef.current || reconnectingRef.current) return;
				try {
					const alive = await invoke('ping_terminal_session', { sessionId });
					if (!alive) {
						throw new Error('session not found');
					}
				} catch (error) {
					reconnectingRef.current = true;
					try {
						terminal.write(
							'\r\n\x1b[33m[连接已断开，正在尝试重连...]\x1b[0m\r\n'
						);
						const { cols, rows } = terminal;
						await invoke('create_terminal_session', {
							sessionId,
							config: { cwd, cols, rows }
						});

						backlogLoaded = false;
						pendingChunks.length = 0;
						try {
							const buffered = await invoke('get_terminal_buffer', {
								sessionId
							});
							if (!unmounted && buffered) {
								writeEncodedChunk(buffered);
							}
						} catch (bufferError) {
							console.warn('获取终端历史失败:', bufferError);
						}
						backlogLoaded = true;

						terminal.write(
							'\r\n\x1b[32m[重连成功]\x1b[0m\r\n'
						);
					} catch (reconnectError) {
						console.error('重连失败:', reconnectError);
						terminal.write(
							`\r\n\x1b[31m[重连失败] ${reconnectError}\x1b[0m\r\n`
						);
					} finally {
						reconnectingRef.current = false;
					}
				}
			}, 5000);
		};

		// 窗口大小调整
		const handleResize = () => {
			if (unmounted) return;
			try {
				fitAddon.fit();
				const { cols, rows } = terminal;
				invoke('resize_terminal', { sessionId, cols, rows }).catch(
					console.error
				);
			} catch (error) {
				console.warn('调整大小失败:', error);
			}
		};

		window.addEventListener('resize', handleResize);
		initSession();
		startHeartbeat();

		// 清理
		return () => {
			console.log(`XtermTerminal 清理函数运行: sessionId=${sessionId}`);
			unmounted = true;
			window.removeEventListener('resize', handleResize);

			if (dataDisposable) {
				try {
					dataDisposable.dispose();
				} catch (e) {
					console.warn('清理 dataDisposable 失败:', e);
				}
			}

			if (unlistenOutput) unlistenOutput();
			if (unlistenClose) unlistenClose();
			if (heartbeatTimer) clearInterval(heartbeatTimer);

			if (terminal) {
				try {
					terminal.dispose();
				} catch (e) {
					console.warn('清理终端失败:', e);
				}
			}

			// 清理 refs
			terminalRef.current = null;
			fitAddonRef.current = null;
			reconnectingRef.current = false;
			closedRef.current = false;
		};
	}, [sessionId, cwd, existingSession]); // 依赖 sessionId、cwd 与 existingSession

	return (
		<div
			ref={containerRef}
			className='w-full h-full bg-[#1e1e1e]'
			style={{ minHeight: '400px' }}
		/>
	);
};

export default XtermTerminal;
