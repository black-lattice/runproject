import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import ProjectInfoCard from "./ProjectInfoCard";
import CommandList from "./CommandList";

const EDITORS_CACHE_TTL = 1000 * 60 * 60 * 24;
const GIT_BRANCHES_CACHE_TTL = 1000 * 60 * 60 * 24;
const NODE_VERSIONS_CACHE_TTL = 1000 * 60 * 60 * 24;
const PROJECT_DETAILS_IDLE_DELAY = 200;

function ProjectDetails({
  project,
  runningCommands,
  onExecuteCommand,
  onStopCommand,
  onGetInstalledVersions,
}) {
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [selectedNodeVersion, setSelectedNodeVersion] = useState("system");
  const [installedVersions, setInstalledVersions] = useState([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState("");
  const [availableEditors, setAvailableEditors] = useState([]);
  const [isLoadingEditors, setIsLoadingEditors] = useState(false);
  const [isRefreshingProjectInfo, setIsRefreshingProjectInfo] = useState(false);
  const latestProjectPathRef = useRef(project?.path);
  const { toast } = useToast();
  const {
    setAvailableEditorsCache,
    setGitBranchesCache,
    commandTags,
    setCommandTags,
    setWorkspaces,
    setSelectedProject,
    normalizeProject,
    normalizeWorkspace,
  } = useAppStore();

  useEffect(() => {
    latestProjectPathRef.current = project?.path;
  }, [project?.path]);

  const compareVersions = (v1, v2) => {
    const cleanV1 = v1.replace(/^v/, "").split(".").map(Number);
    const cleanV2 = v2.replace(/^v/, "").split(".").map(Number);

    for (let i = 0; i < Math.max(cleanV1.length, cleanV2.length); i++) {
      const num1 = isNaN(cleanV1[i]) ? 0 : cleanV1[i];
      const num2 = isNaN(cleanV2[i]) ? 0 : cleanV2[i];
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  };

  const findBestMatchVersion = useCallback((target, availableVersions) => {
    if (!target || target === "system") return "system";
    if (!availableVersions || availableVersions.length === 0) return target;

    const cleanTarget = target.replace(/^v/, "");

    const exactMatch = availableVersions.find(
      (v) =>
        v === target ||
        v === `v${cleanTarget}` ||
        v.replace(/^v/, "") === cleanTarget,
    );
    if (exactMatch) return exactMatch;

    const candidates = availableVersions.filter((v) => {
      const cleanV = v.replace(/^v/, "");
      const partsTarget = cleanTarget.split(".");
      const partsV = cleanV.split(".");

      return partsTarget.every((part, index) => part === partsV[index]);
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => compareVersions(b, a));
      return candidates[0];
    }

    return target;
  }, []);

  const sortedCommands = project?.commands || [];

  const getCachedBranches = useCallback((projectPath) => {
    const { gitBranchesCache } = useAppStore.getState();
    const cachedData = gitBranchesCache[projectPath];
    if (
      cachedData &&
      Date.now() - (cachedData.fetchedAt || 0) < GIT_BRANCHES_CACHE_TTL
    ) {
      return cachedData.branches || [];
    }
    return null;
  }, []);

  const applyBranches = useCallback((branchList) => {
    setBranches(branchList);
    const current = branchList.find((b) => b.is_current);
    setCurrentBranch(current ? current.name : "");
  }, []);

  const loadGitBranches = async ({ forceRefresh = false } = {}) => {
    if (!project?.path) return;
    const projectPath = project.path;
    try {
      let branchList = !forceRefresh ? getCachedBranches(projectPath) : null;
      if (!branchList) {
        setIsLoadingBranches(true);
        branchList = await invoke("list_branches", {
          projectPath,
        });
        setGitBranchesCache(projectPath, branchList);
      }

      if (latestProjectPathRef.current !== projectPath) return;
      applyBranches(branchList);
    } catch (error) {
      console.error("加载 Git 分支失败:", error);
      if (latestProjectPathRef.current !== projectPath) return;
      setBranches([]);
      setCurrentBranch("");
    } finally {
      if (latestProjectPathRef.current === projectPath) {
        setIsLoadingBranches(false);
      }
    }
  };

  const getCachedEditors = useCallback(() => {
    const { availableEditorsCache } = useAppStore.getState();
    if (
      availableEditorsCache?.editors?.length > 0 &&
      Date.now() - (availableEditorsCache.fetchedAt || 0) < EDITORS_CACHE_TTL
    ) {
      return availableEditorsCache.editors;
    }
    return null;
  }, []);

  const applyEditors = useCallback(
    (editors, activeProject = project) => {
      setAvailableEditors(editors);

      const preferences = JSON.parse(
        localStorage.getItem("nodejs-project-preferences") || "{}",
      );
      const projectKey = `${activeProject.name}_${activeProject.path}`;
      const userPref = preferences[projectKey]?.editor;

      if (userPref && editors.find((e) => e.id === userPref && e.installed)) {
        setSelectedEditor(userPref);
      } else {
        const installedEditor = editors.find((e) => e.installed);
        setSelectedEditor(installedEditor ? installedEditor.id : "");
      }
    },
    [project],
  );

  const getPreferredNodeVersion = useCallback((activeProject) => {
    const preferences = JSON.parse(
      localStorage.getItem("nodejs-project-preferences") || "{}",
    );
    const projectKey = `${activeProject.name}_${activeProject.path}`;
    return (
      preferences[projectKey]?.nodeVersion ||
      activeProject.nodeVersion ||
      "system"
    );
  }, []);

  const getCachedNodeVersions = useCallback(() => {
    const { nodeVersionsCache } = useAppStore.getState();
    if (
      nodeVersionsCache?.versions?.length > 0 &&
      Date.now() - (nodeVersionsCache.fetchedAt || 0) < NODE_VERSIONS_CACHE_TTL
    ) {
      return nodeVersionsCache.versions;
    }
    return null;
  }, []);

  const applyNodeVersions = useCallback(
    (versionList, activeProject) => {
      const targetVersion = getPreferredNodeVersion(activeProject);
      const bestMatch = findBestMatchVersion(targetVersion, versionList);
      setInstalledVersions(versionList);
      setSelectedNodeVersion(bestMatch);
    },
    [findBestMatchVersion, getPreferredNodeVersion],
  );

  const loadInstalledVersions = async ({ forceRefresh = false } = {}) => {
    if (!onGetInstalledVersions || !project?.path) return;
    const activeProject = project;
    const projectPath = activeProject.path;

    try {
      let versions = !forceRefresh ? getCachedNodeVersions() : null;
      if (!versions) {
        setIsLoadingVersions(true);
        versions = await onGetInstalledVersions({ forceRefresh });
      }

      if (latestProjectPathRef.current !== projectPath) return;
      applyNodeVersions(versions || [], activeProject);
    } catch (error) {
      console.error("加载Node版本失败:", error);
      if (latestProjectPathRef.current !== projectPath) return;
      setInstalledVersions([]);
      setSelectedNodeVersion(getPreferredNodeVersion(activeProject));
    } finally {
      if (latestProjectPathRef.current === projectPath) {
        setIsLoadingVersions(false);
      }
    }
  };

  const loadAvailableEditors = async ({ forceRefresh = false } = {}) => {
    if (!project?.path) return;
    const projectPath = project.path;
    try {
      let editors = !forceRefresh ? getCachedEditors() : null;
      if (!editors) {
        setIsLoadingEditors(true);
        editors = await invoke("get_available_editors");
        setAvailableEditorsCache(editors);
      }

      if (latestProjectPathRef.current !== projectPath) return;
      applyEditors(editors);
    } catch (error) {
      console.error("加载编辑器列表失败:", error);
      if (latestProjectPathRef.current !== projectPath) return;
      setAvailableEditors([]);
      setSelectedEditor("");
    } finally {
      if (latestProjectPathRef.current === projectPath) {
        setIsLoadingEditors(false);
      }
    }
  };

  const handleSwitchBranch = async (branchName) => {
    if (!project?.path || !branchName || branchName === currentBranch) return;

    setIsLoadingBranches(true);
    try {
      await invoke("switch_branch", {
        projectPath: project.path,
        branch: branchName,
      });

      toast({
        title: "分支切换成功",
        description: `已切换到分支 ${branchName}`,
      });

      const { clearGitBranchesCache } = useAppStore.getState();
      clearGitBranchesCache(project.path);
      loadGitBranches();
    } catch (error) {
      console.error("切换分支失败:", error);
      toast({
        title: "切换分支失败",
        description: error.toString(),
        variant: "destructive",
      });
      setIsLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (!project?.name || !project?.path) return;

    const activeProject = project;
    const cachedBranches = getCachedBranches(activeProject.path);
    const cachedEditors = getCachedEditors();
    const cachedNodeVersions = getCachedNodeVersions();

    if (cachedBranches) {
      applyBranches(cachedBranches);
    } else {
      setBranches([]);
      setCurrentBranch("");
    }

    if (cachedEditors) {
      applyEditors(cachedEditors, activeProject);
    } else {
      setAvailableEditors([]);
      setSelectedEditor("");
    }

    if (cachedNodeVersions) {
      applyNodeVersions(cachedNodeVersions, activeProject);
    } else {
      setInstalledVersions([]);
      setSelectedNodeVersion(getPreferredNodeVersion(activeProject));
    }

    setIsLoadingBranches(false);
    setIsLoadingEditors(false);
    setIsLoadingVersions(false);

    let cancelled = false;
    const loadInBackground = () => {
      if (cancelled || latestProjectPathRef.current !== activeProject.path) {
        return;
      }

      if (!cachedBranches) loadGitBranches();
      if (!cachedEditors) loadAvailableEditors();
      if (!cachedNodeVersions) loadInstalledVersions();
    };

    const timer = window.setTimeout(
      loadInBackground,
      PROJECT_DETAILS_IDLE_DELAY,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    project?.name,
    project?.path,
    project?.nodeVersion,
    getCachedBranches,
    getCachedEditors,
    getCachedNodeVersions,
    applyBranches,
    applyEditors,
    applyNodeVersions,
    getPreferredNodeVersion,
  ]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full p-6 bg-red-50">
        <Card className="w-full max-w-md border-red-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Info className="w-5 h-5" /> 项目数据错误
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">项目对象为空或未定义</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project.name || !project.path) {
    return (
      <div className="flex items-center justify-center h-full p-6 bg-red-50">
        <Card className="w-full max-w-md border-red-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Info className="w-5 h-5" /> 项目数据不完整
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">
              项目缺少必要属性 (name: {project.name}, path: {project.path})
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const saveNodeVersionPreference = (version) => {
    setSelectedNodeVersion(version);
    const preferences = JSON.parse(
      localStorage.getItem("nodejs-project-preferences") || "{}",
    );
    const projectKey = `${project.name}_${project.path}`;
    preferences[projectKey] = {
      nodeVersion: version,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(
      "nodejs-project-preferences",
      JSON.stringify(preferences),
    );
  };

  const saveEditorPreference = (editorId) => {
    setSelectedEditor(editorId);
    const preferences = JSON.parse(
      localStorage.getItem("nodejs-project-preferences") || "{}",
    );
    const projectKey = `${project.name}_${project.path}`;
    const existingPref = preferences[projectKey] || {};
    preferences[projectKey] = {
      ...existingPref,
      editor: editorId,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(
      "nodejs-project-preferences",
      JSON.stringify(preferences),
    );
  };

  const isNodeInstalled = (version) => {
    if (!version || version === "system") return true;
    if (!Array.isArray(installedVersions)) return false;

    if (installedVersions.includes(version)) return true;

    return false;
  };

  const handleInstallNode = async (e) => {
    e.stopPropagation();
    if (!selectedNodeVersion || selectedNodeVersion === "system") return;

    try {
      const result = await invoke("ensure_node_version", {
        version: selectedNodeVersion,
      });

      toast({
        title: "开始安装",
        description: result || `正在安装 Node.js ${selectedNodeVersion}`,
      });

      if (onGetInstalledVersions) {
        const versions = await onGetInstalledVersions({ forceRefresh: true });
        setInstalledVersions(versions || []);
      }
    } catch (error) {
      console.error("安装失败:", error);
      toast({
        title: "启动安装失败",
        description: error.toString(),
        variant: "destructive",
      });
    }
  };

  const handleRefreshProjectInfo = async () => {
    if (!project?.path) return;

    setIsRefreshingProjectInfo(true);
    try {
      const refreshedProject = normalizeProject(
        await invoke("scan_project", {
          projectPath: project.path,
        }),
      );

      const currentWorkspaces = useAppStore.getState().workspaces || [];
      const nextWorkspaces = currentWorkspaces.map((workspace) => {
        const hasTargetProject = (workspace.projects || []).some(
          (item) => item.path === project.path,
        );
        if (!hasTargetProject) {
          return workspace;
        }

        return normalizeWorkspace({
          ...workspace,
          projects: (workspace.projects || []).map((item) =>
            item.path === project.path ? refreshedProject : item,
          ),
        });
      });

      setWorkspaces(nextWorkspaces);
      setSelectedProject(refreshedProject);

      const currentTime = Date.now();
      const workspacesWithVersion = nextWorkspaces.map((workspace) => ({
        ...workspace,
        _cacheVersion: currentTime,
        _cacheTimestamp: new Date().toLocaleString(),
      }));
      localStorage.setItem(
        "nodejs-workspaces",
        JSON.stringify(workspacesWithVersion),
      );
      localStorage.setItem("nodejs-workspaces-version", currentTime.toString());

      await loadGitBranches({ forceRefresh: true });

      toast({
        title: "刷新成功",
        description: `已刷新项目 ${refreshedProject.name} 的 package.json 信息`,
      });
    } catch (error) {
      console.error("刷新项目详情失败:", error);
      toast({
        title: "刷新失败",
        description: error.toString(),
        variant: "destructive",
      });
    } finally {
      setIsRefreshingProjectInfo(false);
    }
  };

  if (hasError) {
    return (
      <div className="p-6 h-full flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-lg border-red-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Info className="w-5 h-5" /> 组件渲染错误
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">项目详情组件渲染时发生错误：</p>
            <pre className="text-red-500 text-xs bg-red-50 p-4 rounded-lg overflow-auto border border-red-100 font-mono">
              {errorInfo && errorInfo.toString()}
            </pre>
            <Button
              onClick={() => {
                setHasError(false);
                setErrorInfo(null);
              }}
              variant="destructive"
              className="w-full"
            >
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50/50 p-6 overflow-y-auto h-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <ProjectInfoCard
          project={project}
          showDebugInfo={showDebugInfo}
          onToggleDebugInfo={() => setShowDebugInfo(!showDebugInfo)}
          branches={branches}
          currentBranch={currentBranch}
          isLoadingBranches={isLoadingBranches}
          onSwitchBranch={handleSwitchBranch}
          onRefreshBranches={() => loadGitBranches({ forceRefresh: true })}
          selectedNodeVersion={selectedNodeVersion}
          installedVersions={installedVersions}
          isLoadingVersions={isLoadingVersions}
          onVersionChange={saveNodeVersionPreference}
          onInstallNode={handleInstallNode}
          isNodeInstalled={isNodeInstalled}
          selectedEditor={selectedEditor}
          availableEditors={availableEditors}
          isLoadingEditors={isLoadingEditors}
          onEditorChange={saveEditorPreference}
          onRefreshEditors={loadAvailableEditors}
          onRefreshProjectInfo={handleRefreshProjectInfo}
          isRefreshingProjectInfo={isRefreshingProjectInfo}
        />

        <CommandList
          project={project}
          runningCommands={runningCommands}
          commands={sortedCommands}
          onExecuteCommand={onExecuteCommand}
          onStopCommand={onStopCommand}
          commandTags={commandTags}
          onSetCommandTags={setCommandTags}
        />
      </div>
    </div>
  );
}

export default ProjectDetails;
