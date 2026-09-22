import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, RotateCw, Square, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { useScriptRunStore } from '@/store/useScriptRunStore';
import { isActiveRun, runDuration, runStatusLabel, runTerminalUrl } from '@/utils/scriptRuns';
import { useToast } from '@/hooks/use-toast';
import './styles.css';

export default function ScriptRuns() {
  const { runs, loading, error, pending, actionErrors, perform, refresh } = useScriptRunStore();
  const workspaces = useAppStore(state => state.workspaces);
  const setSelectedProject = useAppStore(state => state.setSelectedProject);
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now);
  const navigate = useNavigate();
  const { toast } = useToast();
  const active = runs.filter(isActiveRun);
  const finished = runs.filter(run => !isActiveRun(run));

  useEffect(() => {
    if (!active.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active.length]);

  if (!isTauri()) return null;

  const handleAction = async (run, action) => {
    try {
      const result = await perform(run, action);
      if (!result) return;
      const stopped = !isActiveRun(result);
      toast({
        title: action === 'restart'
          ? (stopped ? '新进程已结束，请查看日志' : '已重新启动脚本')
          : (stopped ? '脚本已停止' : '正在等待进程退出'),
      });
    } catch (failure) {
      toast({ title: action === 'restart' ? '重启失败' : '停止失败', description: String(failure), variant: 'destructive' });
    }
  };

  const renderRun = run => {
    const operation = pending[run.id];
    const busy = Boolean(operation || run.restartPending || (run.status === 'stopping' && !run.error));
    const currentProject = workspaces.flatMap(workspace => workspace.projects || [])
      .find(project => project.path === run.project.path);
    const message = actionErrors[run.id] || run.error;
    const label = operation === 'restart' ? '重启中' : operation === 'stop' ? '停止中' : runStatusLabel(run);
    return (
      <li key={run.id} className="script-run-row" aria-label={`${run.project.name} ${run.command.name} ${label}`}>
        <div className="script-run-identity">
          <div className="script-run-title">
            <button type="button" className="script-run-project" disabled={!currentProject}
              onClick={() => setSelectedProject(currentProject)} title={run.project.path}>
              {run.project.name}
            </button>
            <code>{run.command.name}</code>
          </div>
          <span className="script-run-path" title={run.project.path}>{run.project.path}</span>
          {message && <p className="script-run-error" role="alert">{message}</p>}
        </div>
        <div className="script-run-meta">
          <span className={run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{label}</span>
          <span className="text-muted-foreground">{runDuration(run, now)}</span>
          {run.exitCode != null && <span className="text-muted-foreground">退出码 {run.exitCode}</span>}
        </div>
        <div className="script-run-actions">
          <Button size="sm" variant="outline" onClick={() => navigate(runTerminalUrl(run))}
            aria-label={`查看 ${run.project.name} ${run.command.name} 日志`}>
            <Terminal className="h-3.5 w-3.5" />日志
          </Button>
          {!run.restartedAs && <Button size="sm" variant="outline" disabled={busy || Boolean(error)}
              onClick={() => handleAction(run, 'restart')} aria-label={`重启 ${run.project.name} ${run.command.name}`}>
              <RotateCw className={`h-3.5 w-3.5 ${operation === 'restart' || run.restartPending ? 'animate-spin' : ''}`} />{isActiveRun(run) ? '重启' : '重新运行'}
            </Button>}
          {isActiveRun(run) && <Button size="sm" variant="outline" disabled={busy || Boolean(error)}
              onClick={() => handleAction(run, 'stop')} aria-label={`停止 ${run.project.name} ${run.command.name}`}>
              <Square className="h-3.5 w-3.5" />停止
            </Button>}
        </div>
      </li>
    );
  };

  return (
    <section className="script-runs" aria-label="脚本运行概览">
      <button type="button" className="script-runs-heading" aria-expanded={expanded}
        aria-controls="active-script-runs" onClick={() => setExpanded(value => !value)}>
        <ChevronDown className={`h-4 w-4 ${expanded ? '' : '-rotate-90'}`} />
        <span>运行中的脚本</span><span className="text-muted-foreground">{active.length}</span>
        {!active.length && !loading && !error && <span className="script-runs-empty">暂无运行中的脚本</span>}
      </button>
      {error && <div className="script-runs-warning" role="alert">
        <span>状态同步失败，当前显示上次结果：{error}</span>
        <Button size="sm" variant="outline" onClick={refresh}>重试</Button>
      </div>}
      {loading && <p className="script-runs-note" role="status">正在读取运行状态…</p>}
      <ul id="active-script-runs" className="script-run-list" hidden={!expanded}>{active.map(renderRun)}</ul>
      {finished.length > 0 && <details className="script-runs-history">
        <summary>最近结束 <span className="text-muted-foreground">{finished.length}</span></summary>
        <p className="script-runs-note">记录和日志仅保留在本次应用运行期间。</p>
        <ul className="script-run-list">{finished.map(renderRun)}</ul>
      </details>}
    </section>
  );
}
