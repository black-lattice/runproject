import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createRunRefresh } from '@/utils/scriptRuns';

// Read only: the tray must not initialize or overwrite the main window's data.
export default function useTrayProjects() {
  const [snapshot, setSnapshot] = useState({ data: null, loading: true, error: null });
  const syncRef = useRef(null);
  useEffect(() => {
    if (!isTauri()) {
      setSnapshot({ data: null, loading: false, error: '请在桌面应用中查看项目' });
      return;
    }
    let disposed = false;
    let unlisten;
    const sync = createRunRefresh({
      read: () => invoke('load_tray_projects'),
      onData: result => setSnapshot({ data: result.data, loading: false, error: null }),
      onError: error => setSnapshot(previous => ({ ...previous, loading: false, error })),
    });
    syncRef.current = sync;
    const refresh = () => sync.refresh();
    void listen('projects-changed', refresh).then(dispose => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch(error => console.warn('订阅项目更新失败，将通过查询同步:', error));
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      sync.dispose();
      syncRef.current = null;
      unlisten?.();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return { ...snapshot, refresh: () => syncRef.current?.refresh() };
}
