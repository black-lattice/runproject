import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Folder, RefreshCw, Settings, Info } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import DebugInfoPanel from "./DebugInfoPanel";
import GitBranchSelector from "./GitBranchSelector";
import NodeVersionSelector from "./NodeVersionSelector";
import PackageManagerBadge from "./PackageManagerBadge";
import EditorSelector from "./EditorSelector";
import GitWorktreeDialog from "./GitWorktreeDialog";
import { useToast } from "@/hooks/use-toast";
import OpenProjectFolderButton from "@/components/OpenProjectFolderButton";

function ProjectInfoCard({
  project,
  showDebugInfo,
  onToggleDebugInfo,
  branches,
  currentBranch,
  isLoadingBranches,
  onSwitchBranch,
  onRefreshBranches,
  selectedNodeVersion,
  installedVersions,
  isLoadingVersions,
  onVersionChange,
  onInstallNode,
  isNodeInstalled,
  selectedEditor,
  availableEditors,
  isLoadingEditors,
  onEditorChange,
  onRefreshEditors,
  onRefreshProjectInfo,
  isRefreshingProjectInfo,
}) {
  const [worktrees, setWorktrees] = useState([]);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const { toast } = useToast();

  const handleCopyProjectPath = async () => {
    try {
      await navigator.clipboard.writeText(project.path);
      toast({ description: "项目地址已复制到剪贴板" });
    } catch (error) {
      toast({ title: "复制失败", description: String(error), variant: "destructive" });
    }
  };

  const loadWorktrees = async () => {
    if (!project?.path) return;
    setIsLoadingWorktrees(true);
    try {
      const worktreeList = await invoke("list_worktrees", {
        projectPath: project.path,
      });
      setWorktrees(worktreeList);
    } catch (error) {
      console.error("加载 Worktree 失败:", error);
      setWorktrees([]);
    } finally {
      setIsLoadingWorktrees(false);
    }
  };

  const handleCreateWorktree = async (branch, worktreeName) => {
    try {
      const worktreePath = `${project.path}/${worktreeName}`;
      await invoke("create_worktree", {
        projectPath: project.path,
        branch: branch,
        worktreePath: worktreePath,
      });
      toast({
        title: "创建成功",
        description: `已为分支 ${branch} 创建 worktree`,
      });
      loadWorktrees();
    } catch (error) {
      console.error("创建 Worktree 失败:", error);
      toast({
        title: "创建失败",
        description: error.toString(),
        variant: "destructive",
      });
    }
  };

  const handleRemoveWorktree = async (worktreePath) => {
    try {
      await invoke("remove_worktree", {
        projectPath: project.path,
        worktreePath: worktreePath,
      });
      toast({
        title: "删除成功",
        description: `已删除 worktree`,
      });
      loadWorktrees();
    } catch (error) {
      console.error("删除 Worktree 失败:", error);
      toast({
        title: "删除失败",
        description: error.toString(),
        variant: "destructive",
      });
    }
  };

  const handleOpenWorktree = async (worktreePath) => {
    try {
      await invoke("open_in_finder", { path: worktreePath });
    } catch (error) {
      console.error("打开 Worktree 失败:", error);
      toast({
        title: "打开失败",
        description: error.toString(),
        variant: "destructive",
      });
    }
  };

  const handleOpenWorktreeDialog = () => {
    loadWorktrees();
    setShowWorktreeDialog(true);
  };

  return (
    <Card className="project-info-card">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent text-primary rounded-xl">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="page-title text-foreground">
                {project.name}
              </h2>
              <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                <Folder className="w-3.5 h-3.5" />
                <button
                  type="button"
                  className="truncate max-w-[300px] rounded-sm font-mono text-left cursor-default hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={handleCopyProjectPath}
                  aria-label="复制项目地址"
                  title={project.path}
                >
                  {project.path}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <OpenProjectFolderButton key={project.path} project={project} />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onRefreshProjectInfo}
              title="刷新项目详情"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isRefreshingProjectInfo ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onToggleDebugInfo}
            >
              <Settings className="w-4 h-4 mr-2" />
              调试信息
            </Button>
          </div>
        </div>

        {showDebugInfo && (
          <DebugInfoPanel
            project={project}
            sortedCommands={project.commands || []}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <EditorSelector
            project={project}
            selectedEditor={selectedEditor}
            availableEditors={availableEditors}
            isLoadingEditors={isLoadingEditors}
            onEditorChange={onEditorChange}
            onRefreshEditors={onRefreshEditors}
          />

          <GitBranchSelector
            branches={branches}
            currentBranch={currentBranch}
            isLoadingBranches={isLoadingBranches}
            onSwitchBranch={onSwitchBranch}
            onOpenWorktreeDialog={handleOpenWorktreeDialog}
          />

          <NodeVersionSelector
            project={project}
            selectedNodeVersion={selectedNodeVersion}
            installedVersions={installedVersions}
            isLoadingVersions={isLoadingVersions}
            onVersionChange={onVersionChange}
            onInstallNode={onInstallNode}
            isNodeInstalled={isNodeInstalled}
          />

          <PackageManagerBadge project={project} />
        </div>

        {(project.packageManager === "yarn" ||
          project.packageManager === "pnpm") && (
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted p-2 rounded">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>使用 {project.packageManager} 语法自动适配命令与依赖安装</p>
          </div>
        )}

        <GitWorktreeDialog
          isOpen={showWorktreeDialog}
          onClose={() => setShowWorktreeDialog(false)}
          worktrees={worktrees}
          branches={branches}
          onCreateWorktree={handleCreateWorktree}
          onRemoveWorktree={handleRemoveWorktree}
          onOpenWorktree={handleOpenWorktree}
          selectedEditor={selectedEditor}
          availableEditors={availableEditors}
          project={project}
        />
      </CardContent>
    </Card>
  );
}

export default ProjectInfoCard;
