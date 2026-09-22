export const isActiveRun = run =>
  Boolean(run.restartPending) || ['running', 'stopping'].includes(run.status);

export function runStatusLabel(run) {
  if (run.restartPending) return '重启中';
  return {
    running: '运行中', stopping: '停止中', succeeded: '已完成',
    failed: '执行失败', stopped: '已停止',
  }[run.status] || '状态未知';
}

export function runDuration(run, now = Date.now()) {
  const seconds = Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${Math.floor(seconds / 3600)} 时 ${Math.floor((seconds % 3600) / 60)} 分`;
}

export function runTerminalUrl(run) {
  const params = new URLSearchParams({
    sessionId: run.id,
    title: `${run.project.name}-${run.command.name}`,
    cwd: run.project.path,
  });
  return `/terminal?${params}`;
}

// Serialize snapshots so a slow earlier query cannot overwrite newer state.
export function createRunRefresh({ read, onData, onError }) {
  let inFlight = null;
  let requested = false;
  let disposed = false;
  return {
    refresh() {
      if (disposed) return Promise.resolve();
      requested = true;
      if (!inFlight) {
        inFlight = (async () => {
          while (requested && !disposed) {
            requested = false;
            try {
              const runs = await read();
              if (!disposed) onData(runs);
            } catch (error) {
              if (!disposed) onError(String(error));
            }
          }
        })().finally(() => { inFlight = null; });
      }
      return inFlight;
    },
    dispose() { disposed = true; },
  };
}
