import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function terminalTheme(element, isDark) {
  const styles = getComputedStyle(element);
  return {
    background: styles.backgroundColor,
    foreground: styles.color,
    cursor: styles.color,
    selectionBackground: isDark ? '#779cff55' : '#315cc533',
  };
}

export default function useTerminalViewport({ containerRef, terminalRef, fitAddonRef, sessionId, active, isDark }) {
  const activeRef = useRef(active);
  activeRef.current = active;

  const fitVisible = useCallback(() => {
    const container = containerRef.current;
    if (!activeRef.current || !container?.clientWidth || !container?.clientHeight || !terminalRef.current) return false;
    fitAddonRef.current?.fit();
    return true;
  }, [containerRef, terminalRef, fitAddonRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame;
    let disposed = false;
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        try {
          if (!fitVisible()) return;
          const { cols, rows } = terminalRef.current;
          invoke('resize_terminal', { sessionId, cols, rows }).catch(error => {
            if (!disposed) console.warn('调整终端大小失败:', error);
          });
        } catch (error) { console.warn('适配终端大小失败:', error); }
      });
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    window.addEventListener('resize', scheduleFit);
    scheduleFit();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  }, [sessionId, active, fitVisible, containerRef, terminalRef]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!terminalRef.current || !containerRef.current) return;
      terminalRef.current.options.theme = terminalTheme(containerRef.current, isDark);
      if (active && containerRef.current.clientHeight) terminalRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, isDark, sessionId, terminalRef, containerRef]);

  return fitVisible;
}
