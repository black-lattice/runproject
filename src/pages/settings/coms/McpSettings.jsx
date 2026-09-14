import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Copy, RefreshCw, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function McpSettings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const refresh = async () => {
    if (!isTauri()) return;
    setBusy(true);
    try {
      setStatus(await invoke("get_mcp_status"));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ description: "完整配置已复制，已包含访问令牌" });
    } catch {
      toast({
        description: "复制失败，请重试。下方预览隐藏了令牌，不能直接用于连接。",
        variant: "destructive",
      });
    }
  };
  const codexConfig = status?.token
    ? `[mcp_servers.runproject]\nurl = "${status.endpoint.replace("127.0.0.1", "localhost")}"\nhttp_headers = { Authorization = "Bearer ${status.token}" }`
    : "";
  const genericConfig = status?.token
    ? JSON.stringify(
        {
          mcpServers: {
            runproject: {
              type: "http",
              url: status.endpoint,
              headers: { Authorization: `Bearer ${status.token}` },
            },
          },
        },
        null,
        2,
      )
    : "";
  return (
    <div className="space-y-6">
      <section className="settings-section p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <PlugZap className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-medium">连接 Codex 与其他 AI 工具</h3>
              <p className="text-sm text-muted-foreground mt-1">
                桌面应用运行时自动启动，托盘后台运行时也可连接。
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="刷新 MCP 状态"
            disabled={busy || !isTauri()}
            onClick={refresh}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div
          className="mt-5 flex flex-wrap items-center gap-3 text-sm"
          role="status"
        >
          <span
            className={`inline-flex items-center gap-2 ${status?.running ? "text-success" : "text-muted-foreground"}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {!isTauri()
              ? "浏览器预览 · 服务未启动"
              : status?.running
                ? "运行中"
                : status
                  ? "未启动"
                  : "正在读取状态"}
          </span>
          {status?.endpoint && (
            <code className="text-muted-foreground break-all">
              {status.endpoint}
            </code>
          )}
        </div>
        {(error || status?.error) && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error || status.error}
          </p>
        )}
        {!isTauri() && (
          <p className="mt-3 text-sm text-muted-foreground">
            使用 npm run td
            启动桌面应用后，可在这里复制实际连接配置。仅启动网页开发服务不会启动
            MCP。
          </p>
        )}
      </section>
      <section className="settings-section p-5">
        <h3 className="font-medium mb-4">可用功能</h3>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">首页清单与任务</p>
            <p className="text-muted-foreground mt-1">
              查询清单、搜索任务或问题、读取详情、添加任务、更新状态、删除与恢复任务、创建与重命名清单。
            </p>
          </div>
          <div>
            <p className="font-medium">项目管理</p>
            <p className="text-muted-foreground mt-1">
              读取工作区、项目与脚本，添加、刷新、移除工作区，管理标签；启动、停止项目脚本，查询运行状态、退出码和日志。
            </p>
          </div>
        </div>
      </section>
      <section className="settings-section p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">添加到 Codex</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={!codexConfig}
            onClick={() => copy(codexConfig)}
          >
            <Copy className="h-3.5 w-3.5 mr-2" />
            复制完整配置
          </Button>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>保持 RunProject 桌面应用运行，确认上方状态为“运行中”，点击“复制完整配置”。</li>
          <li>
            用代码编辑器打开 <code>~/.codex/config.toml</code>（~ 表示你的用户主目录）。
            如果文件不存在，先创建这个文件。
          </li>
          <li>
            将配置粘贴到文件末尾并保存。如果已有 <code>[mcp_servers.runproject]</code>，
            替换原来的这一段，保留其他配置。
          </li>
          <li>
            重启 Codex，在新任务中输入“通过 RunProject 列出我的清单”，确认能够读取数据。
          </li>
        </ol>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
          <p className="font-medium">为什么需要访问令牌？</p>
          <p className="text-muted-foreground">
            RunProject 的 MCP 可以读写任务、运行项目脚本。访问令牌相当于连接密码，
            用来校验连接方是否获得授权；即使服务只在本机运行，也需要校验。
          </p>
          <p className="text-muted-foreground">
            令牌由 RunProject 自动生成并保存，不是 OpenAI API Key，无需申请或手动填写。
            复制按钮会自动带上它，请保留配置中的 Authorization 这一行。
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          下方仅为配置预览，令牌已隐藏。请使用“复制完整配置”按钮，不要直接复制预览文字。
        </p>
        <pre className="rounded-lg border bg-muted/40 p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all select-text">
          {codexConfig
            ? codexConfig.replace(status.token, "<访问令牌已隐藏>")
            : "启动桌面应用后显示连接配置"}
        </pre>
        <div className="flex items-center justify-between gap-3 pt-2">
          <h3 className="font-medium">其他支持 HTTP 的客户端</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={!genericConfig}
            onClick={() => copy(genericConfig)}
          >
            <Copy className="h-3.5 w-3.5 mr-2" />
            复制 JSON
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          使用 Streamable HTTP，地址与 Bearer 令牌同上。JSON 为常用 mcpServers
          格式；客户端配置字段可能不同。
        </p>
        <p className="text-xs text-muted-foreground">
          仅监听 127.0.0.1，完全退出 RunProject
          后服务停止。删除任务进入回收站；删除清单保留任务并移至收件箱；移除工作区保留磁盘文件。
        </p>
      </section>
    </div>
  );
}
