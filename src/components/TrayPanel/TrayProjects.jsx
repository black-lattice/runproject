import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, Play, ChevronRight } from 'lucide-react';
import { useScriptRunStore } from '@/store/useScriptRunStore';
import { isActiveRun, runStatusLabel } from '@/utils/scriptRuns';
import { trayProjects } from '@/utils/trayProjects';
import useTrayProjects from './useTrayProjects';
import './projects.css';

export default function TrayProjects() {
  const { data, loading, error, refresh } = useTrayProjects();
  const { runs, loading: runsLoading, error: runsError, refresh: refreshRuns } = useScriptRunStore();
  const [pending, setPending] = useState({});
  const [messages, setMessages] = useState({});
  const starting = useRef(new Set());
  const projects = trayProjects(data);

  const start = async (project, command) => {
    const key = `${project.path}::${command.name}`;
    if (starting.current.has(key)) return;
    starting.current.add(key);
    setPending(previous => ({ ...previous, [key]: true }));
    setMessages(previous => ({ ...previous, [key]: null }));
    try {
      const run = await invoke('start_project_script', { projectPath: project.path, script: command.name });
      setMessages(previous => ({ ...previous, [key]: {
        text: isActiveRun(run) ? '已启动' : runStatusLabel(run),
        failed: run.status === 'failed',
      } }));
    } catch (failure) {
      setMessages(previous => ({ ...previous, [key]: { text: `启动失败：${String(failure)}`, failed: true } }));
    } finally {
      await refreshRuns();
      starting.current.delete(key);
      setPending(previous => ({ ...previous, [key]: false }));
    }
  };

  return <div className="tray-projects">
    <div className="tray-panel-summary" title="按近 30 天启动次数排序，次数相同则最近启动的优先"><span>项目列表</span><span>{projects.length} 个项目</span></div>
    {error && <div className="tray-panel-error" role="alert">项目同步失败：{error}<button type="button" onClick={refresh}>重试</button></div>}
    {runsError && <div className="tray-panel-error" role="alert">运行状态同步失败<button type="button" onClick={refreshRuns}>重试</button></div>}
    {loading ? <div className="tray-panel-empty" role="status">正在加载项目…</div> : <>
      {projects.map(project => <details className="tray-project" key={project.path}>
        <summary title={project.path}>
          <ChevronRight size={12} className="tray-project-chevron" aria-hidden="true" />
          <Folder size={14} aria-hidden="true" />
          <strong>{project.name}</strong>
          {runs.some(run => run.project.path === project.path && run.status === 'running') &&
            <span className="tray-project-running-dot" role="img" aria-label={`${project.name} 有命令正在运行`} title="有命令正在运行" />}
          <span>{project.commands.length}</span>
        </summary>
        {project.commands.length ? <ul className="tray-project-commands">
          {project.commands.map(command => {
            const key = `${project.path}::${command.name}`;
            const run = runs.find(item => item.project.path === project.path && item.command.name === command.name && isActiveRun(item));
            const message = messages[key];
            return <li key={command.name}>
              <button type="button" className="tray-project-launch" title={`${command.name}\n${command.script}\n${command.tags.join(' · ')}`}
                aria-label={`启动 ${project.name} ${command.name}`}
                disabled={Boolean(pending[key] || run || error || runsError || runsLoading)}
                onClick={() => start(project, command)}>
                <span className="tray-project-command-line">
                  {run?.status === 'running' && <span className="tray-project-running-dot" role="img" aria-label={`${command.name} 正在运行`} title="运行中" />}
                  <code>{command.name}</code>
                  <span className="tray-project-launch-state">{pending[key] ? '启动中…' : run ? runStatusLabel(run) : <Play size={11} aria-hidden="true" />}</span>
                </span>
                <span className="tray-project-tags">{command.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
              </button>
              {message && <p className={message.failed ? 'tray-panel-error' : 'sr-only'} role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
            </li>;
          })}
        </ul> : <p className="tray-project-no-commands">暂无带标签的命令</p>}
      </details>)}
      {!projects.length && !error && <div className="tray-panel-empty"><Folder size={28} strokeWidth={1.5} aria-hidden="true" /><p>暂无项目</p></div>}
    </>}
  </div>;
}
