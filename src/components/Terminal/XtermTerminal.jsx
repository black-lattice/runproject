import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { useAppStore } from '@/store/useAppStore';
import { useAppAppearance } from '@/components/AppTheme';
import 'xterm/css/xterm.css';
import useTerminalViewport, { terminalTheme } from './useTerminalViewport';

const XtermTerminal = ({
	sessionId,
	cwd,
	onClose,
	existingSession = false,
	active = true
}) => {
	const { isDark } = useAppAppearance();
	const containerRef = useRef(null);
	const terminalRef = useRef(null);
	const fitAddonRef = useRef(null);
	const closedRef = useRef(false);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const fitVisible = useTerminalViewport({ containerRef, terminalRef, fitAddonRef, sessionId, active, isDark });

	useEffect(() => {
		console.log(
			`XtermTerminal useEffect 运行: sessionId=${sessionId}, existingSession=${existingSession}`
		);

		if (!containerRef.current) return;

		closedRef.current = false;

		let unmounted = false;
		let unlistenOutput = null;
		let unlistenClose = null;
		let dataDisposable = null;
		let terminal = null;
		let fitAddon = null;
		let heartbeatTimer = null;
		const pendingChunks = [];
        const managed = sessionId.startsWith("script-");
		let backlogLoaded = !existingSession;
		const COMMAND_DONE_MARKER = '__RUNPROJECT_CMD_DONE__:';
		const commandDoneRegex = /__RUNPROJECT_CMD_DONE__:(\d+):(\d+)/g;
		let markerCarry = '';

		const writeDecodedText = text => {
			if (!text) return;
            if (managed) { terminal?.write(text); return; }
			const combined = markerCarry + text;
			let carry = '';
			for (let i = combined.length - 1; i >= 0; i--) {
				const suffix = combined.slice(i);
				if (
					suffix.length < COMMAND_DONE_MARKER.length &&
					COMMAND_DONE_MARKER.startsWith(suffix)
				) {
					carry = suffix;
					break;
				}
			}
			const processable = combined.slice(0, combined.length - carry.length);
			const matches = [...processable.matchAll(commandDoneRegex)];
			if (matches.length) {
				matches.forEach(match => {
					const runId = Number(match[1]);
					const exitCode = Number(match[2]);
					emit('command-finished', { sessionId, runId, exitCode });
				});
			}
			const output = processable.replace(commandDoneRegex, '');
			markerCarry = carry;
			if (terminal && output) {
				terminal.write(output);
			}
		};

		const writeEncodedChunk = encoded => {
			if (unmounted || !terminal) return;
			try {
				const decoded = atob(encoded);
				const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
				const text = new TextDecoder().decode(bytes);
				writeDecodedText(text);
			} catch (error) {
				console.error('解码输出失败:', error);
			}
		};

		// 创建终端实例
		terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			minimumContrastRatio: 4.5,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: terminalTheme(containerRef.current, isDark),
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
				const visible = fitVisible();

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

				if (unmounted) { unlistenOutput(); return; }

				unlistenClose = await listen(`terminal-closed-${sessionId}`, () => {
					if (unmounted) return;
					closedRef.current = true;
					terminal.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n');
					if (!managed) onCloseRef.current?.();
				});
				if (unmounted) { unlistenClose(); return; }

				let sessionReady = false;
				if (!existingSession && !managed) {
					await invoke('create_terminal_session', {
						sessionId,
						config: { cwd, cols, rows }
					});
					sessionReady = true;
				} else {
					try {
						if (visible) {
							await invoke('resize_terminal', { sessionId, cols, rows });
							sessionReady = true;
						} else {
							sessionReady = await invoke('ping_terminal_session', { sessionId });
						}
					} catch (error) {
						console.warn('调整已存在会话大小失败:', error);
					}
				}

				if (unmounted || (closedRef.current && !managed)) return;
				if (!sessionReady && !managed) {
					closedRef.current = true;
					terminal.write('\r\n\x1b[33m[会话已结束，请新建终端]\x1b[0m\r\n');
					return;
				}

				if (unmounted) return;

				// 监听用户输入 - 必须在会话创建后立即注册
				dataDisposable = terminal.onData(data => {
					if (unmounted || closedRef.current) return;
					const encoded = btoa(
						String.fromCharCode(...new TextEncoder().encode(data))
					);
					invoke('write_to_terminal', { sessionId, data: encoded }).catch(
						console.error
					);

					if (!managed && data === '\x03') {
						const runningCommands =
							useAppStore.getState().runningCommands || {};
						const currentEntry = Object.values(runningCommands).find(
							item => item && item.id === sessionId
						);
						const runId = currentEntry ? currentEntry.runId : null;
						emit('command-interrupted', { sessionId, runId });
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

			} catch (error) {
				if (unmounted) return;
				console.error('终端初始化失败:', error);
				terminal.write(`\r\n\x1b[31m错误: ${error}\x1b[0m\r\n`);
			}
		};

		const startHeartbeat = () => {
			heartbeatTimer = setInterval(async () => {
				if (unmounted || closedRef.current) return;
				try {
					const alive = await invoke('ping_terminal_session', { sessionId });
					if (unmounted || closedRef.current || alive) return;
					closedRef.current = true;
					terminal.write(managed
						? '\r\n\x1b[33m[脚本已退出，日志保留]\x1b[0m\r\n'
						: '\r\n\x1b[33m[终端会话已结束]\x1b[0m\r\n');
					if (!managed) onCloseRef.current?.();
				} catch (error) {
					if (!unmounted) console.warn('检查终端状态失败:', error);
				}
			}, 5000);
		};

		initSession().then(() => { if (!unmounted) startHeartbeat(); });

		// 清理
		return () => {
			console.log(`XtermTerminal 清理函数运行: sessionId=${sessionId}`);
			unmounted = true;

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
			closedRef.current = false;
		};
	}, [sessionId, cwd, existingSession]); // 依赖 sessionId、cwd 与 existingSession

	return (
		<div
			ref={containerRef}
			className='w-full h-full min-h-0 overflow-hidden bg-background text-foreground'
		/>
	);
};

export default XtermTerminal;
