import { FolderOpen, Minus, Plus, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScriptRunStore } from '@/store/useScriptRunStore';
import { runStatusLabel } from '@/utils/scriptRuns';
import useTerminalSessions from '@/hooks/useTerminalSessions';
import XtermTerminal from './XtermTerminal';

export default function TerminalWorkspace({ cwd, title, visible = true, onHide }) {
  const { terminals, activeTerminalId, creating, closing, addTerminal, closeTerminal, selectTerminal } = useTerminalSessions({ cwd, title });
  const { runs, loading: runsLoading, error: runsError } = useScriptRunStore();
  const activeTerminal = terminals.find(item => item.id === activeTerminalId);
  const activeRun = runs.find(run => run.id === activeTerminalId);

  return (
    <div className="terminal-page flex h-full min-h-0 flex-col">
      <div className="bg-card flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />终端
        </span>
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto no-scrollbar" aria-label="终端会话">
          {terminals.map(terminal => {
            const active = terminal.id === activeTerminalId;
            return (
              <div key={terminal.id} className={`group flex h-full shrink-0 items-center gap-1 border-r border-border/60 pl-2 pr-1 ${active ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}>
                <button type="button" onClick={() => selectTerminal(terminal.id)} aria-pressed={active}
                  className="max-w-[180px] truncate rounded-sm px-1 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`${terminal.title}\n${terminal.cwd}`}>
                  {terminal.title}
                </button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:text-destructive"
                  disabled={closing[terminal.id]} onClick={() => closeTerminal(terminal.id)}
                  aria-label={`关闭终端 ${terminal.title}`} title="关闭会话并结束进程">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={creating}
          onClick={() => addTerminal(true)} aria-label="选择目录新建终端" title="选择目录新建终端">
          <FolderOpen className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={creating}
          onClick={() => addTerminal()} aria-label="新建终端" title={cwd ? `在 ${cwd} 新建终端` : '新建终端'}>
          <Plus className="h-4 w-4" />
        </Button>
        {onHide && <>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onHide}
            aria-label="隐藏终端面板" title="隐藏面板，保留会话运行">
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:text-destructive"
            disabled={Boolean(closing[activeTerminalId])} onClick={() => activeTerminal ? closeTerminal(activeTerminal.id) : onHide()}
            aria-label="关闭当前终端" title={activeTerminal ? '关闭当前会话并结束进程' : '关闭终端面板'}>
            <X className="h-4 w-4" />
          </Button>
        </>}
      </div>
      {activeTerminal ? <>
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <FolderOpen className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate" title={activeTerminal.cwd}>{activeTerminal.cwd}</span>
          {activeTerminal.id.startsWith('script-') && <span className="ml-auto shrink-0" role="status">
            {runsError ? '状态同步失败' : activeRun ? runStatusLabel(activeRun) : runsLoading ? '同步中' : '运行记录已过期'}
            {activeRun?.exitCode != null && ` · 退出码 ${activeRun.exitCode}`}
          </span>}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          {terminals.map(terminal => (
            <div key={terminal.id} className="absolute inset-0" hidden={terminal.id !== activeTerminalId}>
              <XtermTerminal sessionId={terminal.id} cwd={terminal.cwd} existingSession
                active={visible && terminal.id === activeTerminalId}
                onClose={() => closeTerminal(terminal.id, { skipServerClose: true })} />
            </div>
          ))}
        </div>
      </> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4 text-sm text-muted-foreground">
        <p>{cwd ? '在当前项目目录打开终端' : '新建终端开始工作'}</p>
        {cwd && <p className="max-w-full truncate text-xs font-mono" title={cwd}>{cwd}</p>}
        <Button type="button" size="sm" disabled={creating} onClick={() => addTerminal()}>
          <Plus className="h-4 w-4" />{creating ? '正在创建…' : '新建终端'}
        </Button>
      </div>}
    </div>
  );
}
