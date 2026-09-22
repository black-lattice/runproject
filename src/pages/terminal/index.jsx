import { useScriptRunStore } from "@/store/useScriptRunStore";
import { runStatusLabel } from "@/utils/scriptRuns";
import PageEmptyState from "@/components/PageEmptyState";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Terminal, X, FolderOpen } from "lucide-react";
import { XtermTerminal } from "@/components/Terminal";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  TERMINAL_PAGE_STORAGE_KEY,
  readTerminalPageState,
} from "@/utils/terminalPageState";

const getInitialTerminalState = () => {
  if (typeof window === "undefined") {
    return { terminals: [], activeTerminalId: null };
  }

  try {
    const parsed = readTerminalPageState();
    const storedTerminals = parsed.terminals;
    const hydratedTerminals = storedTerminals.map((terminal, index) => ({
      ...terminal,
      existingSession: true,
      title: terminal.title || `Terminal ${index + 1}`,
    }));

    const storedActiveId = parsed.activeTerminalId;
    const hasStoredActive = hydratedTerminals.some(
      (t) => t.id === storedActiveId,
    );

    return {
      terminals: hydratedTerminals,
      activeTerminalId: hasStoredActive
        ? storedActiveId
        : (hydratedTerminals[0]?.id ?? null),
    };
  } catch (error) {
    console.error("恢复终端状态失败:", error);
    return { terminals: [], activeTerminalId: null };
  }
};

function TerminalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { runs, loading: runsLoading, error: runsError } = useScriptRunStore();
  const initialStateRef = useRef(null);
  if (!initialStateRef.current) {
    initialStateRef.current = getInitialTerminalState();
  }
  const [terminals, setTerminals] = useState(initialStateRef.current.terminals);
  const [activeTerminalId, setActiveTerminalId] = useState(
    initialStateRef.current.activeTerminalId,
  );
  const [newTerminalName, setNewTerminalName] = useState("");

  useEffect(() => {
    const sessionId = searchParams.get("sessionId");
    const title = searchParams.get("title");
    const cwd = searchParams.get("cwd");

    if (sessionId && cwd) {
      const decodedCwd = cwd;

      setTerminals((prev) => {
        const exists = prev.some((t) => t.id === sessionId);
        if (exists) {
          return prev;
        }

        const newTerminal = {
          id: sessionId,
          title: title || `Terminal ${prev.length + 1}`,
          cwd: decodedCwd,
          existingSession: true,
        };

        return [...prev, newTerminal];
      });

      setActiveTerminalId(sessionId);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let cancelled = false;

    const setupListener = async () => {
      const onStarted = (event) => {
        const payload = event?.payload;
        if (!payload?.sessionId || !payload?.project?.path) return;

        const newTerminal = {
          id: payload.sessionId,
          title:
            payload.title ||
            `${payload.project.name}-${payload.command?.name || "script"}`,
          cwd: payload.project.path,
          existingSession: true,
        };

        setTerminals((prev) => {
          const exists = prev.some((item) => item.id === newTerminal.id);
          return exists
            ? prev.map((item) =>
                item.id === newTerminal.id ? { ...item, ...newTerminal } : item,
              )
            : [...prev, newTerminal];
        });
        setActiveTerminalId(newTerminal.id);
      };
      const disposers = await Promise.all([
        listen("tray-command-started", onStarted),
        listen("script-run-started", onStarted),
      ]);
      const dispose = () => disposers.forEach(fn => fn());

      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleAddTerminal = async (customCwd = null) => {
    const title = newTerminalName.trim() || `Terminal ${terminals.length + 1}`;

    let cwd = customCwd;
    if (!cwd) {
      try {
        cwd = await homeDir();
      } catch (error) {
        console.error("获取 home 目录失败:", error);
        cwd = "/";
      }
    }

    const newTerminal = {
      id: `terminal-${Date.now()}`,
      title,
      cwd,
      existingSession: false,
    };

    setTerminals((prev) => [...prev, newTerminal]);
    setActiveTerminalId(newTerminal.id);
    setNewTerminalName("");
  };

  const handleAddTerminalWithDialog = async () => {
    try {
      const directory = await open({
        directory: true,
        multiple: false,
        title: "选择终端工作目录",
      });

      if (!directory) return;

      await handleAddTerminal(directory);
    } catch (error) {
      console.error("选择终端工作目录失败:", error);
    }
  };

  const handleCloseTerminal = async (
    terminalId,
    { skipServerClose = false } = {},
  ) => {
    if (!terminalId) return;

    if (!skipServerClose && isTauri()) {
      try {
        await invoke("close_terminal_session", { sessionId: terminalId });
      } catch (error) {
        console.error("关闭终端会话失败:", error);
        // Keep the tab and running state when the backend cannot stop it.
        return;
      }
    }
    if (isTauri() && !terminalId.startsWith("script-")) {
      emit("terminal-closed", { sessionId: terminalId });
    }

    setTerminals((prev) => {
      const filtered = prev.filter((t) => t.id !== terminalId);
      if (filtered.length === prev.length) return prev;

      const fallbackId = filtered[0]?.id ?? null;
      setActiveTerminalId((current) => {
        if (!current) return fallbackId;
        if (current === terminalId) return fallbackId;
        const stillExists = filtered.some((t) => t.id === current);
        return stillExists ? current : fallbackId;
      });

      return filtered;
    });
  };

  const activeTerminal = terminals.find((t) => t.id === activeTerminalId);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!terminals.length) {
      window.localStorage.removeItem(TERMINAL_PAGE_STORAGE_KEY);
      return;
    }

    const payload = {
      terminals: terminals.map((terminal) => ({
        ...terminal,
        existingSession: true,
      })),
      activeTerminalId: activeTerminalId ?? terminals[0]?.id ?? null,
    };

    try {
      window.localStorage.setItem(
        TERMINAL_PAGE_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch (error) {
      console.error("保存终端状态失败:", error);
    }
  }, [terminals, activeTerminalId]);

  const activeRun = runs.find(run => run.id === activeTerminalId);

  const terminalActions = (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleAddTerminalWithDialog()}
      >
        <FolderOpen className="h-4 w-4" />
        选择目录
      </Button>
      <Button size="sm" onClick={() => handleAddTerminal()}>
        <Plus className="h-4 w-4" />
        新建终端
      </Button>
    </div>
  );

  return (
    <div className="terminal-page h-full flex flex-col">
      {terminals.length === 0 ? (
        <div className="flex-1 flex flex-col">
          <div className="terminal-empty flex-1 flex items-center justify-center">
            <PageEmptyState
              icon={Terminal}
              title="准备好开始工作了吗？"
              description="新建终端使用默认目录，也可以选择项目文件夹开始。"
            >
              {terminalActions}
            </PageEmptyState>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="terminal-toolbar terminal-tabs flex items-center border-b h-10 pr-2">
            <div className="flex min-w-0 items-center overflow-x-auto no-scrollbar flex-1 h-full">
              {terminals.map((terminal) => {
                const isActive = activeTerminalId === terminal.id;
                return (
                  <div
                    key={terminal.id}
                    className={`
                      group relative flex shrink-0 items-center gap-2 px-4 h-full min-w-[120px] max-w-[200px]
                      cursor-pointer transition-all duration-150 border-r border-border/60
                      ${
                        isActive
                          ? "bg-accent text-primary z-10"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }
                    `}
                    onClick={() => setActiveTerminalId(terminal.id)}
                  >
                    <Terminal
                      className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="text-sm font-medium truncate flex-1">
                      {terminal.title}
                    </span>
                    <button
                      aria-label={`关闭终端 ${terminal.title}`}
                      title={`关闭终端 ${terminal.title}`}
                      className={`
                        p-0.5 rounded transition-all duration-150
                        ${isActive ? "opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted/50 hover:text-muted-foreground"}
                      `}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTerminal(terminal.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            {terminalActions}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
            {activeTerminal && (
              <>
                <div className="terminal-session-path flex items-center gap-2 font-mono border-b border-white/5">
                  <FolderOpen className="h-3 w-3 opacity-60" />
                  <span className="truncate">{activeTerminal.cwd}</span>
                  {activeTerminal.id.startsWith("script-") && (
                    <span className="ml-auto shrink-0" role="status">
                      {runsError ? "状态同步失败" : activeRun ? runStatusLabel(activeRun) : runsLoading ? "同步中" : "运行记录已过期"}
                      {activeRun?.exitCode != null && ` · 退出码 ${activeRun.exitCode}`}
                    </span>
                  )}
                </div>
                <div className="flex-1 relative">
                  {terminals.map((terminal) => (
                    <div
                      key={terminal.id}
                      className={`absolute inset-0 ${terminal.id === activeTerminalId ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                      style={{
                        transition: "opacity 150ms",
                      }}
                    >
                      <XtermTerminal
                        sessionId={terminal.id}
                        cwd={terminal.cwd}
                        existingSession={terminal.existingSession || false}
                        onClose={() =>
                          handleCloseTerminal(terminal.id, {
                            skipServerClose: true,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TerminalPage;
