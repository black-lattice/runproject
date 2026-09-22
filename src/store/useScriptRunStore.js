import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createRunRefresh } from '@/utils/scriptRuns';

let sync = null;
let stopSync = null;
export const useScriptRunStore = create((set, get) => ({
  runs: [],
  loading: true,
  error: null,
  pending: {},
  actionErrors: {},
  refresh: () => sync?.refresh() ?? Promise.resolve(),
  perform: async (run, action) => {
    if (!isTauri() || get().pending[run.id]) return;
    set(state => ({
      pending: { ...state.pending, [run.id]: action },
      actionErrors: { ...state.actionErrors, [run.id]: null },
    }));
    try {
      const result = await invoke(
        action === 'restart' ? 'restart_project_script' : 'stop_project_script',
        { runId: run.id },
      );
      return result;
    } catch (error) {
      set(state => ({ actionErrors: { ...state.actionErrors, [run.id]: String(error) } }));
      throw error;
    } finally {
      await get().refresh();
      set(state => {
        const pending = { ...state.pending };
        delete pending[run.id];
        return { pending };
      });
    }
  },
}));

export function startScriptRunSync() {
  if (stopSync || !isTauri()) return;
  let disposed = false;
  const unlisteners = [];
  sync = createRunRefresh({
    read: () => invoke('list_script_runs'),
    onData: runs => useScriptRunStore.setState({ runs, loading: false, error: null }),
    // Keep the last snapshot visible when IPC fails; it is explicitly marked stale.
    onError: error => useScriptRunStore.setState({ loading: false, error }),
  });
  const refresh = () => sync?.refresh();
  const timer = window.setInterval(refresh, 3000);
  window.addEventListener('focus', refresh);
  const onVisibility = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', onVisibility);
  stopSync = () => {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', onVisibility);
    unlisteners.forEach(unlisten => unlisten());
    sync?.dispose();
    sync = null;
    stopSync = null;
  };
  void (async () => {
    for (const event of ['script-run-started', 'script-run-updated', 'command-finished']) {
      try {
        const unlisten = await listen(event, refresh);
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      } catch (error) {
        console.warn('订阅脚本状态失败，将通过查询同步:', error);
      }
      if (disposed) return;
    }
    await refresh();
  })();
}

if (import.meta.hot) import.meta.hot.dispose(() => stopSync?.());
