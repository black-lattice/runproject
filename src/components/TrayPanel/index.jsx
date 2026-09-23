import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ExternalLink, LayoutGrid, Power, Terminal, ListTodo } from 'lucide-react';
import { startScriptRunSync, useScriptRunStore } from '@/store/useScriptRunStore';
import { isActiveRun, runDuration, runStatusLabel } from '@/utils/scriptRuns';
import './styles.css';
import TrayProjects from './TrayProjects';
import TrayTodos from './TrayTodos';

const tabs = [
  { label: '项目', icon: LayoutGrid },
  { label: '运行命令', icon: Terminal },
  { label: '待办', icon: ListTodo },
];

export default function TrayPanel() {
  const { runs, loading, error, refresh } = useScriptRunStore();
  const [activeTab, setActiveTab] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [actionError, setActionError] = useState('');
  const tabRefs = useRef([]);
  const activeRuns = runs.filter(isActiveRun);

  const panelAction = async action => {
    try {
      await invoke('tray_panel_action', { action });
      setActionError('');
    } catch (failure) {
      setActionError(String(failure));
    }
  };

  useEffect(() => {
    startScriptRunSync();
    const onKeyDown = event => {
      if (event.key === 'Escape' && isTauri()) void panelAction('hide');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!activeRuns.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeRuns.length]);

  const moveTab = event => {
    let next;
    if (event.key === 'ArrowRight') next = (activeTab + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (activeTab + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <main className="tray-panel">
      <header className="tray-panel-header">
        <h1>RunProject</h1>
        <div className="tray-panel-tools">
          <button type="button" aria-label="显示主窗口" title="显示主窗口" onClick={() => panelAction('show')}><ExternalLink size={14} /></button>
          <button type="button" aria-label="退出 RunProject" title="退出 RunProject" onClick={() => panelAction('quit')}><Power size={14} /></button>
        </div>
      </header>
      {actionError && <p className="tray-panel-error" role="alert">{actionError}</p>}
      <section className="tray-panel-content" role="tabpanel" id={`tray-pane-${activeTab}`} aria-labelledby={`tray-tab-${activeTab}`} tabIndex={0}>
        {activeTab === 1 && <>
          <div className="tray-panel-summary"><span>正在运行</span><span>{error ? '状态待同步' : `${activeRuns.length} 个命令`}</span></div>
          {error && <div className="tray-panel-error" role="alert">状态同步失败，当前显示上次结果。<button type="button" onClick={refresh}>重试</button></div>}
          {loading ? <div className="tray-panel-empty" role="status">正在加载运行状态…</div> : activeRuns.length ? (
            <ul className="tray-panel-runs">
              {activeRuns.map(run => <li key={run.id} className="tray-panel-run">
                <div className="tray-panel-run-heading"><strong title={run.project.path}>{run.project.name}</strong><span className="tray-panel-status"><i aria-hidden="true" />{runStatusLabel(run)}</span></div>
                <div className="tray-panel-command"><Terminal size={14} strokeWidth={1.6} aria-hidden="true" /><code title={run.command.script}>{run.command.name}</code></div>
                <p className="tray-panel-script" title={run.command.script}>{run.command.script}</p>
                <div className="tray-panel-run-footer"><span title={run.project.path}>{run.project.path}</span><time>{runDuration(run, now)}</time></div>
                {run.error && <p className="tray-panel-error" role="alert">{run.error}</p>}
              </li>)}
            </ul>
          ) : !error && <div className="tray-panel-empty"><Terminal size={28} strokeWidth={1.5} aria-hidden="true" /><p>暂无运行中的命令</p></div>}
        </>}
        <div hidden={activeTab !== 0}><TrayProjects /></div>
        <div hidden={activeTab !== 2}><TrayTodos /></div>
      </section>
      <nav className="tray-panel-tabs" role="tablist" aria-label="菜单栏面板" onKeyDown={moveTab}>
        {tabs.map(({ label, icon: Icon }, index) => <button key={label} type="button" role="tab" id={`tray-tab-${index}`}
          aria-selected={activeTab === index} aria-controls={`tray-pane-${index}`} tabIndex={activeTab === index ? 0 : -1}
          ref={element => { tabRefs.current[index] = element; }} onClick={() => setActiveTab(index)}>
          <Icon size={14} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
        </button>)}
      </nav>
    </main>
  );
}
