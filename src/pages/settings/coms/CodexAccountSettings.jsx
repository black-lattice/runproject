import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  Import,
  Download,
  Upload,
  Repeat,
  Users,
  ArrowRightLeft,
  WandSparkles,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getCodexAccountList,
  importCurrentCodexAccount,
  exportAllCodexAccounts,
  importCodexAccountArchive,
  switchCodexAccount,
  switchCodexAccountToAvailable,
  syncCurrentCodexAccount,
} from "@/services/codex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const formatTs = (ts) => {
  if (!ts) return "未知";
  return new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
};

const formatSampleTs = (value) => {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatExpiryTs = (value) => {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
};

const formatPercent = (value) =>
  typeof value === "number" && Number.isFinite(value) ? `${value}%` : "未知";

const getRemainingPercent = (windowInfo) =>
  typeof windowInfo?.remainingPercent === "number" &&
  Number.isFinite(windowInfo.remainingPercent)
    ? Math.max(0, Math.min(100, windowInfo.remainingPercent))
    : null;

const getQuotaTone = (remainingPercent) => {
  if (typeof remainingPercent !== "number") return "text-gray-500";
  if (remainingPercent <= 10) return "text-rose-600";
  if (remainingPercent <= 30) return "text-amber-600";
  return "text-emerald-600";
};

const getQuotaAvailability = (status) => {
  const primaryRemaining = getRemainingPercent(status?.primary);
  const secondaryRemaining = getRemainingPercent(status?.secondary);
  const hasAnyWindow = primaryRemaining !== null || secondaryRemaining !== null;

  if (!hasAnyWindow) {
    return {
      label: "暂无额度数据",
      className: "border-gray-200 bg-gray-50 text-gray-500",
    };
  }

  if (primaryRemaining === 0 || secondaryRemaining === 0) {
    return {
      label: "额度已耗尽",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "还有额度",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
};

const summarizeProfileNames = (profileNames) => {
  if (!Array.isArray(profileNames) || profileNames.length === 0) {
    return "未导入任何账号";
  }

  if (profileNames.length <= 3) {
    return profileNames.join("、");
  }

  return `${profileNames.slice(0, 3).join("、")} 等 ${profileNames.length} 个账号`;
};

export function CodexAccountSettings() {
  const { toast } = useToast();
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [data, setData] = useState({
    currentGlobal: null,
    currentGlobalStatus: null,
    currentProfileName: null,
    profiles: [],
  });

  const currentLabel = useMemo(() => {
    const current = data.currentGlobal;
    if (!current) return "未检测到当前全局 Codex 登录";
    return current.email || current.accountId || "已登录，但无法识别邮箱";
  }, [data.currentGlobal]);

  const loadAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getCodexAccountList();
      setData({
        currentGlobal: result.currentGlobal || null,
        currentGlobalStatus: result.currentGlobalStatus || null,
        currentProfileName: result.currentProfileName || null,
        profiles: result.profiles || [],
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleImport = async () => {
    setSubmitting(true);
    setError("");
    try {
      const profile = await importCurrentCodexAccount({
        name: accountName.trim() || null,
      });
      await loadAccounts();
      setAccountName(profile.name);
      toast({
        title: "导入成功",
        description: `账号 ${profile.name} 已保存到工具内。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "导入失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitch = async (profileName) => {
    setSubmitting(true);
    setError("");
    try {
      await switchCodexAccount({ profileName });
      await loadAccounts();
      toast({
        title: "切换成功",
        description: `本机 Codex 已切换到账号 ${profileName}。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "切换失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (profileName) => {
    setSubmitting(true);
    setError("");
    try {
      await syncCurrentCodexAccount({ profileName });
      await loadAccounts();
      toast({
        title: "同步成功",
        description: `已用当前全局 Codex 登录信息刷新 ${profileName}。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "同步失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSwitch = async () => {
    setSubmitting(true);
    setError("");
    try {
      const previousProfileName = data.currentProfileName;
      const profile = await switchCodexAccountToAvailable();
      await loadAccounts();
      toast({
        title:
          previousProfileName === profile.name ? "无需切换" : "自动切换成功",
        description:
          previousProfileName === profile.name
            ? `当前账号 ${profile.name} 仍有额度，已保留当前登录。`
            : `已自动切换到账号 ${profile.name}。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "自动切换失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportAll = async () => {
    setError("");
    const path = await save({
      title: "导出 Codex 账号备份",
      defaultPath: `codex-accounts-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });

    if (!path) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await exportAllCodexAccounts({ path });
      toast({
        title: "导出成功",
        description: `已导出 ${result.exportedCount} 个账号到 ${result.path}。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "导出失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportArchive = async () => {
    setError("");
    const selected = await open({
      title: "选择 Codex 账号备份",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await importCodexAccountArchive({ path: selected });
      await loadAccounts();
      toast({
        title: "导入成功",
        description: `已导入 ${result.importedCount} 个账号：${summarizeProfileNames(result.profileNames)}。`,
      });
    } catch (err) {
      setError(String(err));
      toast({
        title: "导入失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuotaCell = (windowInfo) => {
    if (!windowInfo) {
      return <span className="text-sm text-gray-400">暂无数据</span>;
    }

    return (
      <div className="flex flex-col gap-0.5">
        <span
          className={`text-sm font-semibold ${getQuotaTone(windowInfo.remainingPercent)}`}
        >
          {formatPercent(windowInfo.remainingPercent)} 剩余
        </span>
        <span className="text-xs text-gray-500">
          已用 {formatPercent(windowInfo.usedPercent)}
        </span>
        <span className="text-xs text-gray-400">
          重置: {formatTs(windowInfo.resetsAt)}
        </span>
      </div>
    );
  };

  const renderQuotaBar = (label, windowInfo) => {
    if (!windowInfo) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-sm text-gray-400">暂无数据</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100" />
        </div>
      );
    }

    const remaining = Math.max(
      0,
      Math.min(100, windowInfo.remainingPercent ?? 0),
    );
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className={`text-sm font-semibold ${getQuotaTone(remaining)}`}>
            {formatPercent(remaining)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${
              remaining <= 10
                ? "bg-rose-500"
                : remaining <= 30
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${remaining}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>已用 {formatPercent(windowInfo.usedPercent)}</span>
          <span>重置 {formatTs(windowInfo.resetsAt)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Codex 账号</h2>
          <Button
            variant="outline"
            size="icon"
            title="打开 Codex 账号切换"
            onClick={() => setManagerOpen(true)}
            className="h-9 w-9"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <p className="mt-1 text-sm text-gray-500">
            当前账号显示实时额度，切换和导入放在右侧弹窗里。
          </p>
        </div>
      </div>

      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader className="flex items-center justify-between gap-4 bg-white">
            <div>
              <DialogTitle className="text-lg">Codex 账号切换</DialogTitle>
              <p className="mt-1 text-sm text-gray-500">
                这个面板直接管理本机 <code>~/.codex/auth.json</code>，
                切换后你终端里的原生 <code>codex</code> 命令会立刻使用新的账号。
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={loadAccounts}
              disabled={loading || submitting}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <DialogClose className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogHeader>
          <div className="space-y-4 p-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>使用方式</AlertTitle>
              <AlertDescription>
                先在终端用官方 <code>codex login</code>{" "}
                登录目标账号，再点“导入当前账号快照”。
                切换时工具只回写本机当前的认证文件，不接管你项目里的 Codex
                会话逻辑。
              </AlertDescription>
            </Alert>

            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">当前本机账号</Badge>
                <span className="text-sm font-medium text-gray-900">
                  {currentLabel}
                </span>
                {data.currentGlobal?.planType && (
                  <Badge variant="outline">
                    套餐: {data.currentGlobal.planType}
                  </Badge>
                )}
                {data.currentProfileName && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">
                    已纳入管理: {data.currentProfileName}
                  </Badge>
                )}
              </div>
              {data.currentGlobalStatus && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs text-gray-500">当前 5h 剩余</div>
                    <div className="mt-1">
                      {renderQuotaCell(data.currentGlobalStatus.primary)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs text-gray-500">当前周剩余</div>
                    <div className="mt-1">
                      {renderQuotaCell(data.currentGlobalStatus.secondary)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-xs text-gray-500">实时状态采样</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {formatSampleTs(data.currentGlobalStatus.sampledAt)}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      当前登录账号这里显示的是 <code>~/.codex</code> 实时额度
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 md:flex-row md:items-center">
              <Input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="可选：给当前账号起一个别名"
                className="md:max-w-sm"
              />
              <Button
                onClick={handleImport}
                disabled={submitting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Import className="w-4 h-4" />
                导入当前账号快照
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  自动切到有额度的账号
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  优先保留当前仍可用的账号；否则按周剩余、5H
                  剩余和最近采样时间，切到最合适的已导入账号。
                </div>
              </div>
              <Button
                onClick={handleAutoSwitch}
                disabled={submitting || loading || data.profiles.length === 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <WandSparkles className="h-4 w-4" />
                自动切换
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  批量备份与恢复
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  导出的 JSON 会包含账号认证信息，请只保存在你信任的位置。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportAll}
                  disabled={submitting}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  批量导出
                </Button>
                <Button
                  variant="outline"
                  onClick={handleImportArchive}
                  disabled={submitting}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  批量导入
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!loading && data.profiles.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-gray-400">
          <div className="flex flex-col items-center gap-2">
            <Users className="w-8 h-8 opacity-20" />
            <p>还没有导入任何 Codex 账号</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        {data.profiles.map((profile) => (
          <div
            key={profile.name}
            className={`rounded-xl bg-white p-5 shadow-sm ${
              profile.isActive
                ? "border-2 border-emerald-500 shadow-emerald-100"
                : "border border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-gray-900">
                    {profile.name}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getQuotaAvailability(profile.status).className}`}
                  >
                    {getQuotaAvailability(profile.status).label}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  <p>
                    到期时间:{" "}
                    {formatExpiryTs(profile.meta?.subscriptionActiveUntil)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  title="同步当前登录"
                  onClick={() => handleSync(profile.name)}
                  disabled={submitting}
                >
                  <Repeat className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  title="切换到本机 Codex"
                  onClick={() => handleSwitch(profile.name)}
                  disabled={submitting || profile.isActive}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {renderQuotaBar("5H 剩余用量", profile.status?.primary)}
              {renderQuotaBar("周剩余用量", profile.status?.secondary)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CodexAccountSettings;
