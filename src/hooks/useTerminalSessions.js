import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  readTerminalPageState, subscribeTerminalPageState, upsertTerminalPageSession,
  selectTerminalPageSession, removeTerminalPageSession,
} from '@/utils/terminalPageState';

export function useTerminalSessionState() {
  return useSyncExternalStore(subscribeTerminalPageState, readTerminalPageState, readTerminalPageState);
}

export default function useTerminalSessions({ cwd, title } = {}) {
  const state = useTerminalSessionState();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState({});
  const creatingRef = useRef(false);
  const closingRef = useRef(new Set());

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten;
    listen('terminal-closed', event => {
      const id = event.payload?.sessionId;
      if (!disposed && id && !id.startsWith('script-')) removeTerminalPageSession(id);
    }).then(dispose => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch(error => console.error('监听终端关闭失败:', error));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const addTerminal = async (chooseDirectory = false) => {
    if (creatingRef.current) return;
    if (!isTauri()) {
      toast({ title: '请在桌面应用中使用终端', variant: 'destructive' });
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    try {
      const directory = chooseDirectory
        ? await open({ directory: true, multiple: false, title: '选择终端工作目录' })
        : cwd || await homeDir();
      if (!directory) return;
      const id = `terminal-${crypto.randomUUID()}`;
      // Create once before publishing the tab. Every view only attaches to this session.
      await invoke('create_terminal_session', { sessionId: id, config: { cwd: directory, cols: 80, rows: 24 } });
      upsertTerminalPageSession({
        id, cwd: directory,
        title: !chooseDirectory && title ? `${title} · 终端` : `Terminal ${readTerminalPageState().terminals.length + 1}`,
      });
    } catch (error) {
      toast({ title: '新建终端失败', description: String(error), variant: 'destructive' });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const closeTerminal = async (id, { skipServerClose = false } = {}) => {
    if (!id || closingRef.current.has(id)) return;
    closingRef.current.add(id);
    setClosing(current => ({ ...current, [id]: true }));
    try {
      if (!skipServerClose && isTauri()) {
        await invoke('close_terminal_session', { sessionId: id });
        if (await invoke('ping_terminal_session', { sessionId: id })) {
          throw new Error('进程仍在停止中，请稍后重试。');
        }
      }
      removeTerminalPageSession(id);
    } catch (error) {
      toast({ title: '关闭终端失败', description: String(error), variant: 'destructive' });
    } finally {
      closingRef.current.delete(id);
      setClosing(current => { const next = { ...current }; delete next[id]; return next; });
    }
  };

  return { ...state, creating, closing, addTerminal, closeTerminal, selectTerminal: selectTerminalPageSession };
}
