import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./useAppStore";
import { seedTasks, defaultLists } from "./productivityDefaults";
import { createSyncedData } from "../utils/syncedData";
import { applyTaskRecurrence } from "../utils/taskRecurrence";
import { appendTaskActivity } from "../utils/taskExtras";
import { equalData } from "../utils/mergeData";
import { toast } from "@/hooks/use-toast";

const native = isTauri();
const stored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const error = (message) =>
  toast({
    title: "数据同步失败",
    description: native
      ? `修改保留在页面中，将自动重试。${message}`
      : `修改保留在页面中，请点击重试保存。${message}`,
    variant: "destructive",
  });
const productivityCache = stored("runproject-productivity", null);
const savedTasks =
  productivityCache?.tasks ?? stored("runproject-tasks", seedTasks);
const savedLists =
  productivityCache?.lists ?? stored("runproject-lists", defaultLists);
const productivityEmpty = { tasks: [], lists: [] };
export const productivityData = createSyncedData({
  initial: {
    tasks: Array.isArray(savedTasks)
      ? savedTasks.map((task) => ({
          ...task,
          id: task.id ?? crypto.randomUUID(),
          title: task.title || "未命名任务",
          list: task.list || "收件箱",
          priority: task.priority ?? "中",
          done: Boolean(task.done),
          deleted: Boolean(task.deleted),
          tags: Array.isArray(task.tags) ? task.tags : [],
          subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
          section: task.section || "任务",
          date: task.date || "",
        }))
      : seedTasks,
    lists: Array.isArray(savedLists) ? savedLists : defaultLists,
  },
  empty: productivityEmpty,
  read: native
    ? async () => {
        const data = await invoke("load_productivity_data");
        return {
          initialized: data.initialized,
          data: { tasks: data.tasks, lists: data.lists },
        };
      }
    : null,
  write: async (data, base, initialize) => {
    const result = await invoke("save_productivity_data", {
      ...data,
      base,
      initialize,
    });
    return { tasks: result.tasks, lists: result.lists };
  },
  cache: ({ tasks, lists }) => {
    localStorage.setItem(
      "runproject-productivity",
      JSON.stringify({ tasks, lists }),
    );
  },
  onError: error,
});
const updateData = (updater) =>
  productivityData.update((data) => {
    const next = typeof updater === "function" ? updater(data) : updater;
    return {
      ...next,
      tasks: appendTaskActivity(
        data.tasks,
        applyTaskRecurrence(data.tasks, next.tasks),
      ),
    };
  });
const setTasks = (updater) =>
  updateData((data) => ({
    ...data,
    tasks: typeof updater === "function" ? updater(data.tasks) : updater,
  }));
const setLists = (updater) =>
  updateData((data) => ({
    ...data,
    lists: typeof updater === "function" ? updater(data.lists) : updater,
  }));
export function useProductivityData() {
  const { data, status, error } = useSyncExternalStore(
    productivityData.subscribe,
    productivityData.getSnapshot,
  );
  return {
    ...data,
    setTasks,
    setLists,
    updateData,
    syncStatus: status,
    syncError: error,
    refresh: productivityData.refresh,
  };
}
const projectEmpty = {
  workspaces: [],
  workspaceTags: {},
  projectTags: {},
  commandTags: {},
  preferences: {},
};
const oldStore = stored("app-storage", {})?.state ?? {};
const state = useAppStore.getState();
const projectData = createSyncedData({
  initial: {
    ...projectEmpty,
    workspaces: state.workspaces.length
      ? state.workspaces
      : stored("nodejs-workspaces", oldStore.workspaces ?? []),
    workspaceTags: oldStore.workspaceTags ?? state.workspaceTags,
    projectTags: oldStore.projectTags ?? state.projectTags,
    commandTags: oldStore.commandTags ?? state.commandTags,
    preferences: stored("nodejs-project-preferences", {}),
  },
  empty: projectEmpty,
  read: native ? () => invoke("load_project_data") : null,
  write: (data, base, initialize) =>
    invoke("save_project_data", { data, base, initialize }),
  onError: error,
});
export function persistProjectPreferences(preferences) {
  projectData.update((data) => ({ ...data, preferences }));
}

let started = false;
export function startDataSync() {
  if (started) return;
  started = true;
  let applying = false;
  projectData.subscribe(() => {
    const { data } = projectData.getSnapshot();
    applying = true;
    const current = useAppStore.getState();
    const workspaces = current.normalizeWorkspaces(data.workspaces ?? []);
    const selected = current.selectedProject;
    useAppStore.setState({
      workspaces,
      workspaceTags: data.workspaceTags ?? {},
      projectTags: data.projectTags ?? {},
      commandTags: data.commandTags ?? {},
      selectedProject: selected
        ? (workspaces
            .flatMap((w) => w.projects)
            .find((p) => p.path === selected.path) ?? null)
        : null,
    });
    if (data.preferences)
      localStorage.setItem(
        "nodejs-project-preferences",
        JSON.stringify(data.preferences),
      );
    applying = false;
  });
  useAppStore.subscribe((state, previous) => {
    if (applying) return;
    const data = projectData.getSnapshot().data;
    const next = { ...data };
    for (const key of [
      "workspaces",
      "workspaceTags",
      "projectTags",
      "commandTags",
    ]) {
      if (state[key] !== previous[key]) next[key] = state[key];
    }
    next.preferences = stored("nodejs-project-preferences", {});
    if (!equalData(data, next)) projectData.update(next);
  });
  productivityData.start();
  projectData.start();
  if (native) {
    listen("productivity-changed", () => productivityData.refresh()).catch(
      error,
    );
    listen("projects-changed", () => projectData.refresh()).catch(error);
    // Covers missed startup events and retries temporary database/IPC failures.
    setInterval(() => {
      productivityData.refresh();
      projectData.refresh();
    }, 3000);
  }
}
