import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button as AntButton,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  Menu,
  Modal,
  Popover,
  Select,
  Tag as AntTag,
} from "antd";
import dayjs from "dayjs";
import {
  AppstoreFilled as Grid2X2,
  BellFilled as Bell,
  CalendarFilled as CalendarDays,
  CheckOutlined as Check,
  CheckSquareFilled as CheckSquare2,
  ClockCircleFilled as Timer,
  CodeFilled as Code2,
  DeleteFilled as Trash2,
  DownOutlined as ChevronDown,
  FlagFilled as Flag,
  InboxOutlined as Inbox,
  MoreOutlined as MoreHorizontal,
  CommentOutlined as Comment,
  FontSizeOutlined as TextFormat,
  PlusOutlined as Plus,
  ProjectFilled as CircleDot,
  QuestionCircleFilled as HelpCircle,
  RightOutlined as ChevronRight,
  SearchOutlined as Search,
  SortAscendingOutlined as SortAscending,
  SyncOutlined as RefreshCw,
  TagFilled as Tag,
  UnorderedListOutlined as ListTodo,
} from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { PAGE_CONFIGS } from "@/config/routes";
import { useToast } from "@/hooks/use-toast";
import { ApiOutlined } from "@ant-design/icons";
import {
  dateKey,
  isFinished,
  taskStatus,
  parseQuickTask,
  taskLists,
  withLists,
  searchTasks,
  selectTasks,
  moveTaskTo,
  toolGroups,
  normalizeSubtasks,
} from "@/utils/taskModel";
import {
  TaskTemplateLibrary,
  TaskAttachments,
  TaskActivity,
  TaskNoteEditor,
} from "./components/TaskExtras";
import {
  TaskSectionManager,
  TrashActions,
} from "./components/TaskOrganization";
import {
  listSections,
  saveTaskList,
  removeTaskList,
  addTaskToList,
  updateActiveTask,
} from "@/utils/taskOrganization";
import {
  taskGroups,
  collectTaskActivity,
  shiftCalendarAnchor,
  nextTaskSelection,
} from "@/utils/taskViews";
import { TaskExportDialog } from "./components/TaskExport";
import { resetTaskRecurrence } from "@/utils/taskRecurrence";
import TaskComments from "./components/TaskComments";
import TaskTitleInput from "./components/TaskTitleInput";
import { NotificationPanel } from "./components/TaskReminders";
import TaskSubtasks from "./components/TaskSubtasks";
import {
  TaskScheduleFields,
  TaskReminderFields,
  TaskOrganizationFields,
} from "./components/TaskProperties";
import { pendingReminders, watchReminderClock } from "@/utils/taskReminders";
import { useProductivityData } from "@/store/dataSync";

function Button({ variant, size, children, ...props }) {
  const type =
    variant === "ghost"
      ? "text"
      : variant === "outline"
        ? "default"
        : undefined;
  return (
    <AntButton
      type={type}
      size={size === "sm" || size === "icon" ? "small" : size}
      shape={size === "icon" ? "circle" : undefined}
      {...props}
    >
      {children}
    </AntButton>
  );
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDate(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "long" });
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`;
}

function getWeekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return formatDate(date);
}

const getTaskCategories = taskLists;

function getTaskCreatedDate(task) {
  const value = task?.createdAt ?? task?.createdDate ?? task?.date;
  if (!value) return "";
  const date = dayjs(value);
  if (!date.isValid()) return "";
  return date.year() === dayjs().year()
    ? date.format("M月D日")
    : date.format("YYYY年M月D日");
}

function WelcomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addTab } = useAppStore();
  const { toast } = useToast();
  const { tasks, lists, setTasks, updateData, syncStatus, syncError, refresh } =
    useProductivityData();
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [activeNav, setActiveNav] = useState("today");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(null);
  const [extrasTargetId, setExtrasTargetId] = useState(null);
  const extrasTask = tasks.find((task) => task.id === extrasTargetId);
  const openTaskExtras = (kind) => {
    setExtrasTargetId(selected.id);
    setExtrasOpen(kind);
  };
  const updateExtraTask = (updater) =>
    updateData((current) => updateActiveTask(current, extrasTargetId, updater));
  const noteEditorRef = useRef(null);
  const [exportRequest, setExportRequest] = useState(null);
  const [newTaskSection, setNewTaskSection] = useState(null);
  useEffect(() => setNewTaskSection(null), [activeNav]);
  const updateSelected = (updater) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === selected.id
          ? typeof updater === "function"
            ? updater(task)
            : { ...task, ...updater }
          : task,
      ),
    );
  const [showDetail, setShowDetail] = useState(true);
  const [smallDetailOpen, setSmallDetailOpen] = useState(false);
  const detailCloseRef = useRef(null);
  const detailFocusRequest = useRef(null);
  const [detailFocusVersion, setDetailFocusVersion] = useState(0);
  const requestDetailFocus = (id) => {
    detailFocusRequest.current = {
      id,
      waitForOverlay:
        searchOpen || notificationsOpen || extrasOpen === "templates",
    };
    setDetailFocusVersion((version) => version + 1);
  };
  const focusRequestedDetail = () => {
    const request = detailFocusRequest.current;
    if (!request || request.waitForOverlay) return;
    requestAnimationFrame(() => {
      if (detailFocusRequest.current !== request || !detailCloseRef.current)
        return;
      detailCloseRef.current.focus();
      detailFocusRequest.current = null;
    });
  };
  const afterDetailSourceClosed = () => {
    if (!detailFocusRequest.current) return;
    detailFocusRequest.current.waitForOverlay = false;
    focusRequestedDetail();
  };
  const openTaskDetail = (id) => {
    setSelectedId(id);
    setShowDetail(true);
    setSmallDetailOpen(true);
    requestDetailFocus(id);
  };
  const closeTaskDetail = () => {
    const id = selected.id;
    detailFocusRequest.current = null;
    setSmallDetailOpen(false);
    setShowDetail(false);
    requestAnimationFrame(() => {
      const trigger = [
        ...document.querySelectorAll("[data-task-open-id]"),
      ].find((element) => element.dataset.taskOpenId === String(id));
      (trigger || document.getElementById("task-input"))?.focus();
    });
  };
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [now, setNow] = useState(Date.now);
  const today = dateKey(new Date(now));
  const unreadCount = pendingReminders(tasks, now).length;
  useEffect(() => watchReminderClock(setNow), []);
  const [sortMode, setSortMode] = useState("默认排序");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  useEffect(() => setSubtaskInput(""), [selectedId]);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [listEditor, setListEditor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const isTaskView = activeTool === null;
  useEffect(() => {
    if (
      isTaskView &&
      showDetail &&
      detailFocusRequest.current?.id === selectedId
    ) {
      focusRequestedDetail();
    }
  }, [detailFocusVersion, isTaskView, showDetail, selectedId]);
  const tomorrowDate = shiftDate(today, 1);
  const upcomingEndDate = shiftDate(today, 6);
  const toggleSection = (section) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };
  useEffect(() => {
    if (searchParams.get("notifications")) {
      setNotificationsOpen(true);
      setSearchParams({}, { replace: true });
    }
    const taskId = searchParams.get("task");
    const task = tasks.find((task) => String(task.id) === taskId);
    if (task) {
      setActiveTool(null);
      setActiveNav(task.deleted ? "trash" : "all");
      setPriorityFilter("全部");
      setStatusFilter("all");
      setTagFilter("");
      setHideCompleted(false);
      setShowDetail(true);
      setSmallDetailOpen(true);
      setSelectedId(task.id);
      requestDetailFocus(task.id);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, tasks]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (
        event.key.toLowerCase() === "n" &&
        tag !== "INPUT" &&
        tag !== "TEXTAREA" &&
        !document.activeElement?.isContentEditable &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        document.getElementById("task-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const visibleTasks = useMemo(
    () =>
      selectTasks(tasks, {
        nav: activeNav,
        day: today,
        priority: priorityFilter,
        status: statusFilter,
        tag: tagFilter,
        hideCompleted,
        sort: sortMode,
      }),
    [
      tasks,
      activeNav,
      today,
      priorityFilter,
      statusFilter,
      tagFilter,
      hideCompleted,
      sortMode,
    ],
  );
  const searchResults = useMemo(
    () => searchTasks(tasks, search),
    [tasks, search],
  );
  const allTags = [
    ...new Set(
      tasks.filter((task) => !task.deleted).flatMap((task) => task.tags || []),
    ),
  ].sort();
  const revealTask = (id) => {
    setActiveNav(
      tasks.find((task) => task.id === id)?.deleted ? "trash" : "all",
    );
    setPriorityFilter("全部");
    setStatusFilter("all");
    setTagFilter("");
    setHideCompleted(false);
    openTaskDetail(id);
    setActiveTool(null);
  };

  const selectionView = JSON.stringify([
    activeNav,
    priorityFilter,
    statusFilter,
    tagFilter,
    hideCompleted,
  ]);
  const previousSelectionView = useRef(selectionView);
  useEffect(() => {
    const changed = previousSelectionView.current !== selectionView;
    previousSelectionView.current = selectionView;
    const next = nextTaskSelection(selectedId, visibleTasks, tasks, changed);
    if (next !== selectedId) setSelectedId(next);
  }, [selectedId, visibleTasks, tasks, selectionView]);

  const selected = tasks.find((task) => task.id === selectedId) ||
    visibleTasks[0] || {
      id: null,
      title: "暂无任务",
      time: "",
      list: "收件箱",
      priority: "中",
      done: false,
      tags: [],
      reminder: "",
      repeat: "",
      subtasks: [],
      detail: "从左侧或上方添加一个任务。",
    };
  const addTask = (value = input, overrides = {}, options = {}) => {
    const title = String(value).trim();
    if (!title) return;
    if (new TextEncoder().encode(title).length > 1000) {
      toast({
        description: "任务标题过长，请控制在1000字节以内",
        variant: "destructive",
      });
      return;
    }
    if (
      !overrides.list &&
      (activeNav === "completed" || activeNav === "trash")
    ) {
      toast({ description: "请先选择今天、清单或收件箱再创建任务" });
      return;
    }
    // 新建任务默认使用实际创建日；“最近 7 天”只负责统计，不改变任务日期。
    const parsed = parseQuickTask(
      title,
      today,
      options.defaultDate ??
        (["today", "upcoming"].includes(activeNav)
          ? today
          : activeNav === "tomorrow"
            ? tomorrowDate
            : ""),
    );
    const group =
      newTaskSection?.list === currentList && !overrides.list
        ? newTaskSection
        : null;
    if (
      group &&
      !listSections(lists, tasks, group.list).includes(group.section)
    ) {
      setNewTaskSection(null);
      toast({
        description: "该分组已变更，请重新选择后添加",
        variant: "destructive",
      });
      return;
    }
    const createdAt = Date.now();
    const task = {
      id: crypto.randomUUID(),
      createdAt,
      date: parsed.date,
      title: parsed.title || "未命名任务",
      time: parsed.time,
      list: activeNav.startsWith("list:") ? activeNav.slice(5) : "收件箱",
      ...(group ? { sections: { [group.list]: group.section } } : {}),
      priority: "中",
      done: false,
      status: "pending",
      tags: [],
      reminder: "",
      repeat: "",
      subtasks: [],
      detail: "",
      ...overrides,
    };
    try {
      updateData((current) => {
        if (
          group &&
          !listSections(current.lists, current.tasks, group.list).includes(
            group.section,
          )
        )
          throw new Error("分组已被删除或重命名，请重新选择分组");
        return addTaskToList(current, task);
      });
    } catch (error) {
      toast({ description: error.message, variant: "destructive" });
      return;
    }
    const matchesCurrentView =
      selectTasks([task], {
        nav: activeNav,
        day: today,
        priority: priorityFilter,
        status: statusFilter,
        tag: tagFilter,
        hideCompleted,
      }).length > 0;
    if (!activeTool && !matchesCurrentView) {
      revealTask(task.id);
    } else {
      setSelectedId(task.id);
      setShowDetail(true);
      setSmallDetailOpen(true);
      if (!activeTool) requestDetailFocus(task.id);
    }
    if (!overrides.list) setInput("");
    return task;
  };
  const toggle = (id) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              done: !isFinished(task),
              status: isFinished(task) ? "pending" : "done",
            }
          : task,
      ),
    );
  const open = (id) => {
    addTab(id);
    navigate(PAGE_CONFIGS[id].path);
  };
  const moveTask = (id, target) => {
    setTasks((current) =>
      current.map((task) =>
        String(task.id) === String(id) ? moveTaskTo(task, target, today) : task,
      ),
    );
  };
  const currentList = activeNav.startsWith("list:") ? activeNav.slice(5) : null;
  const activeTasks = tasks.filter((task) => !task.deleted);
  const currentViewTitle =
    currentList ||
    {
      all: "所有任务",
      overdue: "已逾期",
      today: "今天",
      tomorrow: "明天",
      upcoming: "最近 7 天",
      inbox: "收件箱",
      completed: "已结束",
      trash: "垃圾桶",
      summary: "任务摘要",
    }[activeNav] ||
    "今天";
  const groupedVisibleTasks = useMemo(
    () => taskGroups(visibleTasks, { lists, tasks, listName: currentList }),
    [visibleTasks, currentList, lists, tasks],
  );
  const exportView = () =>
    setExportRequest({
      title: `${currentViewTitle} · 当前视图`,
      tasks: visibleTasks,
    });
  const activityTasks = currentList
    ? tasks.filter((task) => taskLists(task).includes(currentList))
    : visibleTasks;
  const navItems = [
    [
      "all",
      "所有任务",
      ListTodo,
      String(activeTasks.filter((t) => !isFinished(t)).length),
    ],
    [
      "overdue",
      "已逾期",
      Timer,
      String(
        activeTasks.filter((t) => !isFinished(t) && t.date && t.date < today)
          .length,
      ),
    ],
    [
      "today",
      "今天",
      CalendarDays,
      String(
        activeTasks.filter((t) => !isFinished(t) && t.date === today).length,
      ),
    ],
    [
      "upcoming",
      "最近7天",
      CalendarDays,
      String(
        activeTasks.filter(
          (t) => !isFinished(t) && t.date >= today && t.date <= upcomingEndDate,
        ).length,
      ),
    ],
    [
      "inbox",
      "收件箱",
      Inbox,
      String(
        activeTasks.filter(
          (t) => !isFinished(t) && getTaskCategories(t).includes("收件箱"),
        ).length,
      ),
    ],
  ];
  const saveList = () => {
    try {
      updateData((current) =>
        saveTaskList(
          current,
          listEditor?.previousLabel || "",
          listEditor?.value || "",
        ),
      );
      if (activeNav === `list:${listEditor?.previousLabel}`)
        setActiveNav(`list:${listEditor.value.trim()}`);
      setListEditor(null);
    } catch (error) {
      toast({ description: error.message, variant: "destructive" });
    }
  };
  const executeConfirmedAction = () => {
    if (confirmAction?.type === "delete-list") {
      const label = confirmAction.label;
      try {
        updateData((current) => removeTaskList(current, label));
        if (activeNav === `list:${label}`) setActiveNav("inbox");
      } catch (error) {
        toast({ description: error.message, variant: "destructive" });
        setConfirmAction(null);
        return;
      }
    }
    if (confirmAction?.type === "delete-task") {
      setTasks((current) =>
        current.map((task) =>
          task.id === confirmAction.id
            ? { ...task, deleted: true, deletedAt: Date.now() }
            : task,
        ),
      );
      setSelectedId(null);
    }
    setConfirmAction(null);
  };
  const duplicateTask = () => {
    if (selected.id == null) return;
    const copy = {
      ...resetTaskRecurrence(selected),
      activity: [],
      reminder: "",
      reminderNotified: "",
      reminderAcknowledged: "",
      subtasks: normalizeSubtasks(selected).map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        done: false,
      })),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      deleted: false,
      title: `${selected.title}（副本）`,
      done: false,
      status: "pending",
    };
    setTasks((current) => [copy, ...current]);
    revealTask(copy.id);
    toast({ description: "已创建任务副本" });
  };
  const copyText = (value, success, failure = "复制失败") =>
    Promise.resolve()
      .then(() => {
        if (!navigator.clipboard) throw new Error("剪贴板不可用");
        return navigator.clipboard.writeText(value);
      })
      .then(() => toast({ description: success }))
      .catch(() => toast({ description: failure, variant: "destructive" }));
  const handleTaskAction = ({ key }) => {
    if (selected.id == null) return;
    if (key === "subtask") {
      document
        .querySelector('input[placeholder="添加子任务，回车保存"]')
        ?.focus();
    } else if (key === "pin") {
      setTasks((current) =>
        current.map((task) =>
          task.id === selected.id ? { ...task, pinned: !task.pinned } : task,
        ),
      );
      toast({ description: selected.pinned ? "已取消置顶" : "任务已置顶" });
    } else if (key === "abandon") {
      setTasks((current) =>
        current.map((task) =>
          task.id === selected.id
            ? { ...task, done: true, status: "abandoned" }
            : task,
        ),
      );
      toast({ description: "任务已标记为放弃" });
    } else if (key === "tag") {
      document.querySelector('input[placeholder="添加标签"]')?.focus();
    } else if (key === "duplicate") {
      duplicateTask();
    } else if (key === "copy") {
      copyText(
        `${window.location.href.split("#")[0]}#/welcome?task=${selected.id}`,
        "已复制本机任务链接，仅在此设备中打开",
      );
    } else if (key === "print" || key === "export") {
      setExportRequest({ title: selected.title, tasks: [selected] });
    } else if (key === "delete") {
      setConfirmAction({ type: "delete-task", id: selected.id });
    } else if (key === "restore") {
      setTasks((current) =>
        current.map((task) =>
          task.id === selected.id ? { ...task, deleted: false } : task,
        ),
      );
      toast({ description: "任务已恢复" });
    } else if (key === "template") {
      openTaskExtras("templates");
    } else if (key === "activity" || key === "attachment") {
      openTaskExtras(key);
    }
  };
  const handleRailAction = (label) => {
    if (label === "同步") {
      refresh();
    } else if (label === "通知") {
      setNotificationsOpen(true);
    } else if (label === "帮助") {
      setExtrasOpen("help");
    }
  };
  return (
    <>
      <div
        className={`task-home h-full overflow-hidden ${smallDetailOpen ? "small-detail-open" : ""} ${isTaskView ? "is-task-view" : "is-tool-view"}`}
      >
        <div
          className={`task-layout ${isTaskView ? "is-task-view" : "is-tool-view"}`}
        >
          <nav className="task-rail">
            {[
              [null, "任务", CheckSquare2],
              ["calendar", "日历", CalendarDays],
              ["timeline", "时间线", Timer],
              ["matrix", "四象限", Grid2X2],
              ["kanban", "看板", CircleDot],
            ].map(([tool, label, Icon]) => (
              <Button
                key={label}
                variant="ghost"
                size="icon"
                className={`task-rail-button ${activeTool === tool ? "is-active" : ""}`}
                title={label}
                aria-label={
                  label === "通知" && unreadCount
                    ? `通知（${unreadCount} 条待处理）`
                    : label
                }
                onClick={() => setActiveTool(tool)}
              >
                <Icon className="h-5 w-5" />
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="task-rail-button"
              title="搜索"
              aria-label="搜索"
              onClick={() => {
                setActiveTool(null);
                setSearchOpen(true);
              }}
            >
              <Search className="h-5 w-5" />
            </Button>
            <div className="mt-auto flex flex-col gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="task-rail-button"
                title="MCP 服务"
                aria-label="MCP 服务"
                onClick={() => {
                  addTab("settings");
                  navigate("/settings?section=mcp");
                }}
              >
                <ApiOutlined className="h-5 w-5" />
              </Button>
              {[
                ["同步", RefreshCw],
                ["通知", Bell],
                ["帮助", HelpCircle],
              ].map(([label, Icon]) => (
                <Button
                  key={label}
                  variant="ghost"
                  size="icon"
                  className="task-rail-button"
                  title={label}
                  aria-label={
                    label === "通知" && unreadCount
                      ? `通知（${unreadCount} 条待处理）`
                      : label
                  }
                  onClick={() => handleRailAction(label)}
                >
                  <Icon className="h-5 w-5" />
                  {label === "通知" && unreadCount > 0 && (
                    <span
                      className="home-notification-badge"
                      aria-hidden="true"
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </nav>
          {isTaskView && (
            <aside className="task-sidebar">
              <Menu
                className="task-antd-menu"
                mode="inline"
                selectedKeys={[activeNav]}
                onClick={({ key }) => setActiveNav(key)}
                items={navItems.map(([id, label, Icon, count]) => ({
                  key: id,
                  icon: <Icon className="h-4 w-4" />,
                  label: (
                    <span className="task-menu-label">
                      <span>{label}</span>
                      {count && (
                        <span className="task-menu-count">{count}</span>
                      )}
                    </span>
                  ),
                }))}
              />
              <div className="task-sidebar-divider" />
              <div className="task-sidebar-section-heading">
                <div
                  className="task-sidebar-section-toggle"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsedSections.lists}
                  onClick={() => toggleSection("lists")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSection("lists");
                    }
                  }}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${collapsedSections.lists ? "-rotate-90" : ""}`}
                  />
                  <span>清单</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="新建清单"
                  onClick={(event) => {
                    event.stopPropagation();
                    setListEditor({ previousLabel: "", value: "" });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!collapsedSections.lists && (
                <div className="task-sidebar-group">
                  {lists.map(([label], i) => (
                    <div
                      key={label}
                      role="button"
                      tabIndex={0}
                      className={`task-nav-item ${activeNav === `list:${label}` ? "is-active" : ""}`}
                      onClick={() => setActiveNav(`list:${label}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setActiveNav(`list:${label}`);
                      }}
                      onDoubleClick={() =>
                        setListEditor({ previousLabel: label, value: label })
                      }
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setConfirmAction({ type: "delete-list", label });
                      }}
                    >
                      <span className={`task-list-dot dot-${i}`} />{" "}
                      <span>{label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {
                          activeTasks.filter(
                            (task) =>
                              !isFinished(task) &&
                              getTaskCategories(task).includes(label),
                          ).length
                        }
                      </span>
                      <Dropdown
                        trigger={["click"]}
                        menu={{
                          items: [
                            { key: "rename", label: "重命名" },
                            { key: "delete", label: "删除", danger: true },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            if (key === "rename")
                              setListEditor({
                                previousLabel: label,
                                value: label,
                              });
                            if (key === "delete")
                              setConfirmAction({ type: "delete-list", label });
                          },
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="task-list-action"
                          aria-label={`${label}清单菜单`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </Dropdown>
                    </div>
                  ))}
                </div>
              )}
              <div className="task-sidebar-note-group">
                <div
                  className="task-sidebar-note-heading"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsedSections.filters}
                  onClick={() => toggleSection("filters")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSection("filters");
                    }
                  }}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${collapsedSections.filters ? "-rotate-90" : ""}`}
                  />
                  <span>过滤器</span>
                </div>
                {!collapsedSections.filters && (
                  <div className="task-sidebar-note">
                    <Select
                      aria-label="筛选优先级"
                      value={priorityFilter}
                      onChange={setPriorityFilter}
                      options={["全部", "高", "中", "低", "无"].map(
                        (value) => ({
                          value,
                          label:
                            value === "全部" ? "全部优先级" : `${value}优先级`,
                        }),
                      )}
                      style={{ width: "100%" }}
                    />
                    {(priorityFilter !== "全部" || tagFilter) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPriorityFilter("全部");
                          setStatusFilter("all");
                          setTagFilter("");
                        }}
                      >
                        清除筛选
                      </Button>
                    )}
                  </div>
                )}
                <div
                  className="task-sidebar-note-heading"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsedSections.tags}
                  onClick={() => toggleSection("tags")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSection("tags");
                    }
                  }}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${collapsedSections.tags ? "-rotate-90" : ""}`}
                  />
                  <span>标签</span>
                </div>
                {!collapsedSections.tags && (
                  <div className="task-sidebar-note">
                    {allTags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {allTags.map((tag) => (
                          <Button
                            key={tag}
                            size="sm"
                            variant={tagFilter === tag ? "outline" : "ghost"}
                            onClick={() => {
                              setTagFilter(tagFilter === tag ? "" : tag);
                              setActiveNav("all");
                            }}
                          >
                            #{tag}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      "在任务详情添加标签，即可按标签查找"
                    )}
                  </div>
                )}
              </div>
              <Menu
                className="task-antd-menu mt-auto"
                mode="inline"
                selectedKeys={[activeNav]}
                onClick={({ key }) => {
                  if (key === "projects") open("projects");
                  else setActiveNav(key);
                }}
                items={[
                  {
                    key: "completed",
                    icon: <Check className="h-4 w-4" />,
                    label: (
                      <span className="task-menu-label">
                        <span>已结束</span>
                        <span className="task-menu-count">
                          {
                            tasks.filter(
                              (task) => isFinished(task) && !task.deleted,
                            ).length
                          }
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "trash",
                    icon: <Trash2 className="h-4 w-4" />,
                    label: (
                      <span className="task-menu-label">
                        <span>垃圾桶</span>
                        <span className="task-menu-count">
                          {tasks.filter((task) => task.deleted).length}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "projects",
                    icon: <Code2 className="h-4 w-4" />,
                    label: "项目工作台",
                  },
                ]}
              />
            </aside>
          )}
          {isTaskView && (
            <main className="task-main">
              <div className="home-mobile-nav gap-2 mb-3">
                <Select
                  aria-label="切换任务清单"
                  value={activeNav}
                  style={{ flex: 1 }}
                  onChange={(value) => {
                    setActiveNav(value);
                    setSmallDetailOpen(false);
                  }}
                  options={[
                    ...navItems.map(([value, label]) => ({ value, label })),
                    ...lists.map(([label]) => ({
                      value: `list:${label}`,
                      label,
                    })),
                    { value: "completed", label: "已结束" },
                    { value: "trash", label: "垃圾桶" },
                  ]}
                />
                <Button
                  aria-label="新建清单"
                  onClick={() =>
                    setListEditor({ previousLabel: "", value: "" })
                  }
                >
                  <Plus />
                </Button>
              </div>
              <div className="task-main-header">
                <div>
                  {!activeNav.startsWith("list:") && (
                    <p className="text-xs font-medium text-primary">
                      {formatDateLabel(today)}
                    </p>
                  )}
                  <h1 className="mt-1 text-2xl font-semibold text-foreground">
                    {activeNav === "overdue"
                      ? "已逾期"
                      : activeNav === "summary"
                        ? "任务摘要"
                        : activeNav === "inbox"
                          ? "收件箱"
                          : activeNav === "tomorrow"
                            ? "明天"
                            : activeNav === "upcoming"
                              ? "最近 7 天"
                              : activeNav === "all"
                                ? "所有任务"
                                : activeNav === "completed"
                                  ? "已结束"
                                  : activeNav === "trash"
                                    ? "垃圾桶"
                                    : activeNav.startsWith("list:")
                                      ? activeNav.slice(5)
                                      : "今天"}{" "}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {visibleTasks.length}
                    </span>
                  </h1>
                </div>
                <div className="task-main-actions flex-wrap">
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    title="筛选当前任务"
                    content={
                      <div className="grid gap-3" style={{ width: 250 }}>
                        <label className="grid gap-1 text-xs">
                          状态
                          <Select
                            aria-label="筛选任务状态"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={[
                              { value: "all", label: "全部状态" },
                              { value: "pending", label: "待处理" },
                              { value: "in-progress", label: "进行中" },
                              { value: "done", label: "已完成" },
                              { value: "abandoned", label: "已放弃" },
                            ]}
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          优先级
                          <Select
                            aria-label="筛选任务优先级"
                            value={priorityFilter}
                            onChange={setPriorityFilter}
                            options={["全部", "高", "中", "低", "无"].map(
                              (value) => ({ value, label: value }),
                            )}
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          标签
                          <Select
                            aria-label="筛选任务标签"
                            value={tagFilter}
                            onChange={setTagFilter}
                            options={[
                              { value: "", label: "全部标签" },
                              ...allTags.map((value) => ({
                                value,
                                label: value,
                              })),
                            ]}
                          />
                        </label>
                        <Button
                          onClick={() => {
                            setStatusFilter("all");
                            setPriorityFilter("全部");
                            setTagFilter("");
                            setHideCompleted(false);
                          }}
                        >
                          清除筛选
                        </Button>
                      </div>
                    }
                  >
                    <Button>
                      筛选
                      {statusFilter !== "all" ||
                      priorityFilter !== "全部" ||
                      tagFilter
                        ? " · 已启用"
                        : ""}
                    </Button>
                  </Popover>
                  {currentList && (
                    <TaskSectionManager
                      listName={currentList}
                      lists={lists}
                      tasks={tasks}
                      onChange={updateData}
                    />
                  )}
                  <Button onClick={() => openTaskExtras("templates")}>
                    模板
                  </Button>
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: ["默认排序", "时间", "优先级"].map((label) => ({
                        key: label,
                        label: sortMode === label ? `✓ ${label}` : label,
                      })),
                      onClick: ({ key }) => setSortMode(key),
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="task-sort-button"
                      aria-label={`排序：${sortMode}`}
                      title={`排序：${sortMode}`}
                    >
                      <SortAscending className="h-5 w-5" />
                    </Button>
                  </Dropdown>
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    classNames={{ root: "task-more-dropdown" }}
                    menu={{
                      items: [
                        {
                          key: "view-label",
                          type: "group",
                          label: "视图",
                          children: [
                            {
                              key: "list-view",
                              icon: <ListTodo />,
                              label: "列表视图",
                              onClick: () => setActiveTool(null),
                            },
                            {
                              key: "board-view",
                              icon: <Grid2X2 />,
                              label: "看板视图",
                              onClick: () => setActiveTool("kanban"),
                            },
                            {
                              key: "timeline-view",
                              icon: <Timer />,
                              label: "时间线视图",
                              onClick: () => setActiveTool("timeline"),
                            },
                          ],
                        },
                        { type: "divider" },
                        {
                          key: "hide-completed",
                          label: hideCompleted ? "显示已完成" : "隐藏已完成",
                          onClick: () => setHideCompleted((value) => !value),
                        },
                        {
                          key: "show-detail",
                          label: showDetail ? "隐藏详情" : "显示详情",
                          onClick: () =>
                            showDetail
                              ? closeTaskDetail()
                              : selected.id != null &&
                                openTaskDetail(selected.id),
                        },
                        {
                          key: "settings",
                          label: "显示设置",
                          onClick: () => open("settings"),
                        },
                        { type: "divider" },
                        {
                          key: "add-group",
                          label: "新建清单",
                          onClick: () =>
                            setListEditor({ previousLabel: "", value: "" }),
                        },
                        {
                          key: "share",
                          label: "复制任务内容",
                          onClick: exportView,
                        },
                        {
                          key: "activity",
                          label: currentList ? "清单动态" : "当前视图动态",
                          onClick: () => setExtrasOpen("list-activity"),
                        },
                        {
                          key: "print",
                          label: "打印",
                          onClick: exportView,
                        },
                      ],
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="task-more-button"
                      aria-label="更多选项"
                      title="更多选项"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </Dropdown>
                </div>
              </div>
              {activeNav === "summary" && (
                <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Card size="small" className="task-summary-card is-blue">
                    <div className="text-xs text-primary">待完成</div>
                    <div className="mt-1 text-2xl font-semibold text-primary">
                      {tasks.filter((t) => !isFinished(t) && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-green">
                    <div className="text-xs text-success">已结束</div>
                    <div className="mt-1 text-2xl font-semibold text-success">
                      {tasks.filter((t) => isFinished(t) && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-orange">
                    <div className="text-xs text-warning">今日任务</div>
                    <div className="mt-1 text-2xl font-semibold text-warning">
                      {
                        tasks.filter((t) => t.date === today && !t.deleted)
                          .length
                      }
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-violet">
                    <div className="text-xs text-violet-600">垃圾桶</div>
                    <div className="mt-1 text-2xl font-semibold text-violet-900">
                      {tasks.filter((t) => t.deleted).length}
                    </div>
                  </Card>
                </div>
              )}
              <div role="status" className="mb-3 text-xs text-muted-foreground">
                {syncError
                  ? `保存失败：${syncError}`
                  : {
                      loading: "正在加载…",
                      saving: "正在保存…",
                      ready: "已保存",
                      local: "已保存到此浏览器",
                    }[syncStatus] || ""}
                {syncError && (
                  <Button size="sm" onClick={refresh}>
                    重试
                  </Button>
                )}
                {statusFilter !== "all" && (
                  <AntTag closable onClose={() => setStatusFilter("all")}>
                    {
                      {
                        pending: "待处理",
                        "in-progress": "进行中",
                        done: "已完成",
                        abandoned: "已放弃",
                      }[statusFilter]
                    }
                  </AntTag>
                )}
                {priorityFilter !== "全部" && (
                  <AntTag closable onClose={() => setPriorityFilter("全部")}>
                    优先级：{priorityFilter}
                  </AntTag>
                )}
                {tagFilter && (
                  <AntTag closable onClose={() => setTagFilter("")}>
                    #{tagFilter}
                  </AntTag>
                )}
              </div>
              {activeNav === "trash" && (
                <div className="mb-4">
                  <TrashActions tasks={tasks} onChange={setTasks} />
                </div>
              )}
              {newTaskSection?.list === currentList && (
                <div className="mt-3 text-xs text-muted-foreground">
                  添加到分组{" "}
                  <AntTag closable onClose={() => setNewTaskSection(null)}>
                    {newTaskSection.section}
                  </AntTag>
                </div>
              )}
              <div className="task-quick-add">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="task-input"
                  disabled={["completed", "trash"].includes(activeNav)}
                  placeholder={
                    activeNav.startsWith("list:")
                      ? `添加任务至“${activeNav.slice(5)}”，回车即可创建`
                      : "添加任务，试试输入“明天下午3点开会”"
                  }
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.nativeEvent.isComposing) addTask();
                  }}
                />
                <Button
                  disabled={
                    !input.trim() || ["completed", "trash"].includes(activeNav)
                  }
                  onClick={() => addTask()}
                >
                  添加
                </Button>
              </div>
              {visibleTasks.length === 0 && (
                <Empty
                  className="task-empty"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    activeNav === "trash"
                      ? "垃圾桶为空"
                      : activeNav === "completed"
                        ? "还没有已结束任务"
                        : priorityFilter !== "全部" ||
                            statusFilter !== "all" ||
                            tagFilter
                          ? "没有符合筛选条件的任务"
                          : "这里还没有任务，按 N 快速添加"
                  }
                />
              )}
              {groupedVisibleTasks.map(
                ({ key: groupKey, label, items, section, finished }) => (
                  <div className="task-section" key={groupKey}>
                    {(() => {
                      const sectionKey = `tasks:${activeNav}:${groupKey}`;
                      const isHeaderless = !finished && !section;
                      const isCollapsed = isHeaderless
                        ? false
                        : (collapsedSections[sectionKey] ??
                          (finished &&
                            !["completed", "trash"].includes(activeNav)));
                      return (
                        <>
                          {!isHeaderless && (
                            <div className="task-section-title">
                              <button
                                type="button"
                                className="task-section-toggle"
                                aria-expanded={!isCollapsed}
                                onClick={() => toggleSection(sectionKey)}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                                />
                                <span className="truncate">{label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {items.length}
                                </span>
                              </button>
                              {currentList && !finished && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`在“${label}”分组新建任务`}
                                  onClick={() => {
                                    setNewTaskSection({
                                      list: currentList,
                                      section,
                                    });
                                    setCollapsedSections((current) => ({
                                      ...current,
                                      [sectionKey]: false,
                                    }));
                                    document
                                      .getElementById("task-input")
                                      ?.focus();
                                  }}
                                >
                                  <Plus />
                                </Button>
                              )}
                            </div>
                          )}
                          {!isCollapsed &&
                            items.map((task) => (
                              <TaskRow
                                key={task.id}
                                task={task}
                                showCreatedDate={
                                  activeNav === "upcoming" ||
                                  activeNav === "inbox"
                                }
                                selected={task.id === selectedId}
                                onSelect={() => openTaskDetail(task.id)}
                                onToggle={() => toggle(task.id)}
                                onPriority={() =>
                                  setTasks((current) =>
                                    current.map((item) =>
                                      item.id === task.id
                                        ? {
                                            ...item,
                                            priority:
                                              item.priority === "高"
                                                ? "中"
                                                : item.priority === "中"
                                                  ? "低"
                                                  : "高",
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            ))}
                        </>
                      );
                    })()}
                  </div>
                ),
              )}
            </main>
          )}
          {isTaskView && showDetail && selected.id != null && (
            <aside className="task-detail">
              <div className="task-detail-toolbar">
                <Button
                  ref={detailCloseRef}
                  className="ml-auto"
                  aria-label="关闭任务详情"
                  onClick={closeTaskDetail}
                >
                  关闭
                </Button>
                <div className="flex items-center gap-2">
                  <Checkbox
                    className="task-detail-top-checkbox"
                    aria-label={`${isFinished(selected) ? "重新打开" : "完成"}任务：${selected.title}`}
                    checked={Boolean(isFinished(selected))}
                    onChange={() => toggle(selected.id)}
                  />
                  <span className="task-detail-top-divider" />
                  <DatePicker
                    className={`task-detail-date-picker ${selected.date ? "has-date" : ""}`}
                    variant="borderless"
                    placeholder="设置日期"
                    value={selected.date ? dayjs(selected.date) : null}
                    format={
                      selected.date
                        ? (value) =>
                            value.isSame(dayjs(), "day")
                              ? `今天, ${value.format("M月D日")}`
                              : value.format("YYYY年M月D日")
                        : "设置日期"
                    }
                    suffixIcon={<CalendarDays className="h-5 w-5" />}
                    onChange={(value) =>
                      setTasks((current) =>
                        current.map((task) =>
                          task.id === selected.id
                            ? {
                                ...task,
                                date: value?.format("YYYY-MM-DD") || "",
                                time: value ? task.time : "",
                              }
                            : task,
                        ),
                      )
                    }
                  />
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: [
                        { key: "high", label: "🚩  高优先级" },
                        { key: "medium", label: "🚩  中优先级" },
                        { key: "low", label: "🚩  低优先级" },
                        { key: "none", label: "⚑  无优先级" },
                      ],
                      onClick: ({ key }) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? {
                                  ...task,
                                  priority: {
                                    high: "高",
                                    medium: "中",
                                    low: "低",
                                    none: "无",
                                  }[key],
                                }
                              : task,
                          ),
                        ),
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="task-detail-flag"
                      aria-label="设置优先级"
                    >
                      <Flag className="h-5 w-5" />
                    </Button>
                  </Dropdown>
                </div>
              </div>
              <div className="task-detail-body">
                {!visibleTasks.some((task) => task.id === selected.id) && (
                  <div
                    role="status"
                    className="mb-4 rounded-lg border border-border p-3 text-xs text-muted-foreground"
                  >
                    {selected.deleted
                      ? "此任务已移入垃圾桶。"
                      : "任务已不在当前视图中，仍可在这里继续编辑。"}
                    <Button size="sm" onClick={() => revealTask(selected.id)}>
                      {selected.deleted ? "查看垃圾桶" : "在所有任务中查看"}
                    </Button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="task-detail-checkbox"
                    aria-label={`${isFinished(selected) ? "重新打开" : "完成"}任务：${selected.title}`}
                    checked={Boolean(isFinished(selected))}
                    onChange={() => toggle(selected.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <TaskTitleInput
                      task={selected}
                      onCommit={(title, taskId) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === taskId ? { ...task, title } : task,
                          ),
                        )
                      }
                    />
                    <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                      <CalendarDays className="h-4 w-4" />
                      {selected.date
                        ? `${selected.date} ${selected.time || "全天"}`
                        : "未安排日期"}
                    </div>
                  </div>
                  <ListTodo
                    className="task-detail-list-icon"
                    aria-label="清单"
                  />
                </div>
                {selected.deleted && (
                  <div className="task-detail-section">
                    <TrashActions
                      tasks={tasks}
                      onChange={setTasks}
                      taskId={selected.id}
                    />
                  </div>
                )}
                <TaskSubtasks
                  task={selected}
                  inputValue={subtaskInput}
                  onInputChange={setSubtaskInput}
                  onChange={updateSelected}
                />
                <TaskScheduleFields
                  task={selected}
                  today={today}
                  onChange={updateSelected}
                />
                <div
                  id="task-note-editor"
                  className="task-detail-section task-detail-note-section"
                >
                  <TaskNoteEditor
                    key={selected.id}
                    editorRef={noteEditorRef}
                    value={selected.detail || ""}
                    onChange={(detail) => updateSelected({ detail })}
                    ariaLabel="任务备注"
                  />
                </div>
                <TaskReminderFields
                  task={selected}
                  tasks={tasks}
                  today={today}
                  onChange={updateSelected}
                  onReveal={revealTask}
                />
                <TaskOrganizationFields
                  task={selected}
                  tasks={tasks}
                  lists={lists}
                  currentList={currentList}
                  onChange={updateSelected}
                  onTasksChange={setTasks}
                  onDataChange={updateData}
                />
              </div>
              <div className="task-detail-footer">
                <Dropdown
                  trigger={["click"]}
                  placement="topLeft"
                  menu={{
                    items: ["收件箱", ...lists.map(([label]) => label)].map(
                      (label) => ({ key: label, label }),
                    ),
                    onClick: ({ key }) =>
                      setTasks((current) =>
                        current.map((task) =>
                          task.id === selected.id
                            ? withLists(task, [key])
                            : task,
                        ),
                      ),
                  }}
                >
                  <button type="button" className="task-detail-list-trigger">
                    <Tag className="h-4 w-4" />
                    <span>{getTaskCategories(selected).join(" · ")}</span>
                  </button>
                </Dropdown>
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => noteEditorRef.current?.focus()}
                    aria-label="编辑备注"
                  >
                    <TextFormat className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="评论"
                    title="添加评论"
                    onClick={() => openTaskExtras("comments")}
                  >
                    <Comment className="h-5 w-5" />
                  </Button>
                  <Dropdown
                    trigger={["click"]}
                    placement="topRight"
                    menu={{
                      items: [
                        { key: "subtask", label: "添加子任务" },
                        {
                          key: "pin",
                          label: selected.pinned ? "取消置顶" : "置顶",
                        },
                        { key: "abandon", label: "放弃" },
                        { key: "tag", label: "标签" },
                        { key: "attachment", label: "上传附件" },
                        { type: "divider" },
                        { key: "activity", label: "任务动态" },
                        { key: "template", label: "保存为模板" },
                        { key: "duplicate", label: "创建副本" },
                        { key: "copy", label: "复制本机链接" },
                        { key: "export", label: "复制任务内容" },
                        { key: "print", label: "打印" },
                        selected.deleted
                          ? { key: "restore", label: "恢复任务" }
                          : {
                              key: "delete",
                              label: "移入垃圾桶",
                              danger: true,
                            },
                      ],
                      onClick: handleTaskAction,
                    }}
                  >
                    <Button variant="ghost" size="icon" aria-label="更多操作">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </Dropdown>
                </div>
              </div>
            </aside>
          )}
        </div>
        {activeTool && (
          <ToolOverlay
            mode={activeTool}
            tasks={tasks.filter((task) => !task.deleted)}
            lists={lists}
            baseDate={today}
            onClose={() => setActiveTool(null)}
            onCreate={addTask}
            onMove={moveTask}
            onSelect={revealTask}
          />
        )}
        <TaskExportDialog
          open={Boolean(exportRequest)}
          onClose={() => setExportRequest(null)}
          title={exportRequest?.title || "任务"}
          tasks={exportRequest?.tasks || []}
          onFeedback={toast}
        />
        <TaskTemplateLibrary
          open={extrasOpen === "templates"}
          onClose={() => setExtrasOpen(null)}
          onAfterClose={afterDetailSourceClosed}
          sourceTask={extrasTask && !extrasTask.deleted ? extrasTask : null}
          lists={lists.map(([name]) => name)}
          onFeedback={toast}
          onCreateTask={(task) => {
            const fresh = resetTaskRecurrence(task);
            updateData((current) => addTaskToList(current, fresh));
            revealTask(fresh.id);
          }}
        />
        <Modal
          open={[
            "activity",
            "attachment",
            "list-activity",
            "comments",
          ].includes(extrasOpen)}
          title={
            {
              activity: "任务动态",
              attachment: "任务附件",
              "list-activity": currentList ? "清单动态" : "当前视图动态",
              comments: "任务评论",
            }[extrasOpen]
          }
          footer={null}
          onCancel={() => setExtrasOpen(null)}
          destroyOnHidden
          width={560}
        >
          {["activity", "attachment", "comments"].includes(extrasOpen) && (
            <p className="mb-3 text-xs text-muted-foreground">
              {extrasTask
                ? `任务：${extrasTask.title}`
                : "原任务已被删除，请关闭此窗口后重新选择。"}
            </p>
          )}
          {extrasOpen === "activity" && extrasTask && (
            <TaskActivity task={extrasTask} />
          )}
          {extrasTask?.deleted &&
            ["attachment", "comments"].includes(extrasOpen) && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                任务已在垃圾桶中，请先恢复任务。
              </p>
            )}
          {extrasOpen === "list-activity" && (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {currentList
                  ? "此清单全部任务（含垃圾桶）的最近 100 条动态，不受筛选影响。"
                  : "当前视图任务的最近 100 条动态。"}
              </p>
              <TaskActivity
                task={{ activity: collectTaskActivity(activityTasks) }}
              />
            </>
          )}
          {extrasOpen === "attachment" && extrasTask && (
            <TaskAttachments
              key={extrasTask.id}
              task={extrasTask}
              disabled={extrasTask.deleted}
              onChange={(attachments) => updateExtraTask({ attachments })}
              onFeedback={toast}
            />
          )}
          {extrasOpen === "comments" && extrasTask && (
            <TaskComments
              key={extrasTask.id}
              task={extrasTask}
              onChange={updateExtraTask}
            />
          )}
        </Modal>
        <NotificationPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onAfterClose={afterDetailSourceClosed}
          tasks={tasks}
          setTasks={setTasks}
          onSelect={revealTask}
        />
        <Modal
          open={extrasOpen === "help"}
          title="首页使用帮助"
          footer={<Button onClick={() => setExtrasOpen(null)}>知道了</Button>}
          onCancel={() => setExtrasOpen(null)}
        >
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              <strong>快速记录：</strong>按 N
              输入任务，回车创建；“明天下午3点开会”会识别日期与时间。清单和收件箱默认不设日期。
            </p>
            <p>
              <strong>计划与进度：</strong>
              日历按日期安排；时间线区分逾期和未安排；四象限区分重要、紧急；看板追踪处理状态。拖动和任务菜单均可移动任务。
            </p>
            <p>
              <strong>查找：</strong>Cmd/Ctrl+K
              搜索全部任务与备注，侧栏按标签和优先级筛选；窄窗口使用顶部清单选择器。
            </p>
            <p>
              <strong>保存与提醒：</strong>修改自动保存。桌面应用与 MCP
              共用数据库；网页预览保存在当前浏览器。站内提醒在应用打开期间生效，完全退出后下次打开会补查。
            </p>
            <p>
              <strong>整理：</strong>
              详情内管理子任务、重复规则、附件和备注。垃圾桶可恢复任务；永久删除需要确认。
            </p>
          </div>
        </Modal>
        <Modal
          open={Boolean(listEditor)}
          title={listEditor?.previousLabel ? "重命名清单" : "新建清单"}
          okText="保存"
          cancelText="取消"
          onOk={saveList}
          onCancel={() => setListEditor(null)}
          destroyOnHidden
        >
          <Input
            autoFocus
            placeholder="请输入清单名称"
            value={listEditor?.value || ""}
            onChange={(event) =>
              setListEditor((current) => ({
                ...current,
                value: event.target.value,
              }))
            }
            onPressEnter={(event) => {
              if (!event.nativeEvent.isComposing) saveList();
            }}
          />
        </Modal>
        <Modal
          open={Boolean(confirmAction)}
          title={
            confirmAction?.type === "delete-list"
              ? `删除清单“${confirmAction.label}”？`
              : "将任务移入垃圾桶？"
          }
          okText={confirmAction?.type === "delete-list" ? "删除" : "移入垃圾桶"}
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onOk={executeConfirmedAction}
          onCancel={() => setConfirmAction(null)}
          destroyOnHidden
        >
          <p className="text-sm text-muted-foreground">
            {confirmAction?.type === "delete-list"
              ? "任务保留其他清单归属；没有其他归属时移入收件箱。"
              : "你可以在垃圾桶中恢复此任务。"}
          </p>
        </Modal>
        <Modal
          open={searchOpen}
          title="搜索全部任务、备注或标签"
          footer={null}
          onCancel={() => setSearchOpen(false)}
          afterClose={afterDetailSourceClosed}
          destroyOnHidden
        >
          <Input
            autoFocus
            allowClear
            prefix={<Search className="h-4 w-4 text-muted-foreground" />}
            placeholder="输入关键词搜索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-4 max-h-64 overflow-y-auto">
            {search.trim() && searchResults.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的任务"
              />
            )}
            {search.trim() &&
              searchResults.slice(0, 100).map((task) => (
                <button
                  key={task.id}
                  className="task-search-result"
                  onClick={() => {
                    revealTask(task.id);
                    setSearchOpen(false);
                  }}
                >
                  <span>{task.title}</span>
                  <span>{getTaskCategories(task).join(" · ")}</span>
                </button>
              ))}
          </div>
        </Modal>
      </div>
    </>
  );
}
function ToolOverlay({
  mode,
  tasks,
  lists,
  baseDate,
  onClose,
  onCreate,
  onSelect,
  onMove,
}) {
  const [calendarView, setCalendarView] = useState("月");
  const [anchor, setAnchor] = useState(baseDate);
  const [scope, setScope] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [draft, setDraft] = useState(null);
  const today = dateKey();
  const scoped = tasks.filter(
    (t) =>
      (!scope || taskLists(t).includes(scope)) &&
      (mode === "kanban" || showFinished || !isFinished(t)),
  );
  const groups = toolGroups(scoped, mode, today);
  const names = {
    calendar: "日历",
    timeline: "时间线",
    matrix: "四象限",
    kanban: "看板",
  };
  const navigateDate = (direction) =>
    setAnchor(shiftCalendarAnchor(anchor, calendarView, direction));
  const start =
    calendarView === "月"
      ? getWeekStart(dayjs(anchor).startOf("month").format("YYYY-MM-DD"))
      : calendarView === "周"
        ? getWeekStart(anchor)
        : anchor;
  const dateCount =
    calendarView === "月"
      ? 42
      : calendarView === "周"
        ? 7
        : calendarView === "议程"
          ? 30
          : 1;
  const dates = Array.from({ length: dateCount }, (_, index) =>
    shiftDate(start, index),
  );
  const startCreate = (date = "", target = "") => {
    const initialDate = moveTaskTo({ date }, target, today).date || "";
    setDraft({
      title: "",
      date: initialDate,
      list: scope || "收件箱",
      target,
      dateExplicit: Boolean(initialDate) || target === "未安排",
    });
  };
  const saveDraft = () => {
    if (!draft?.title.trim()) return;
    const overrides = moveTaskTo(
      { list: draft.list, tags: [], priority: "无" },
      draft.target,
      today,
    );
    // Column dates initialize the picker; the user's final date selection wins.
    delete overrides.date;
    delete overrides.time;
    if (draft.dateExplicit) {
      overrides.date = draft.date;
      if (!draft.date) overrides.time = "";
    }
    const created = onCreate(draft.title, overrides, {
      defaultDate: draft.date,
    });
    if (created) {
      setDraft(null);
      if (
        (scope && !taskLists(created).includes(scope)) ||
        (mode === "calendar" && created.date && !dates.includes(created.date))
      ) {
        onSelect(created.id);
      }
    }
  };
  const card = (task) => (
    <div
      className={`tool-task ${isFinished(task) ? "is-done" : ""}`}
      key={task.id}
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData("task-id", String(task.id))
      }
    >
      <div className="flex items-start gap-2">
        <Checkbox
          aria-label={`完成任务：${task.title}`}
          checked={Boolean(isFinished(task))}
          onChange={() =>
            onMove(task.id, isFinished(task) ? "待处理" : "已完成")
          }
        />
        <button
          className="tool-task-title min-w-0 flex-1 text-left"
          aria-label={`打开任务：${task.title}`}
          onClick={() => onSelect(task.id)}
        >
          {task.title}
        </button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "今天", label: "安排到今天" },
              { key: "明天", label: "安排到明天" },
              { key: "未安排", label: "清除日期" },
              { type: "divider" },
              ...["待处理", "进行中", "已完成", "已放弃"].map((key) => ({
                key,
                label: key,
              })),
              ...(mode === "matrix"
                ? toolGroups([], "matrix").map(([key]) => ({ key, label: key }))
                : []),
            ],
            onClick: ({ key }) => onMove(task.id, key),
          }}
        >
          <Button
            size="icon"
            variant="ghost"
            aria-label={`移动任务：${task.title}`}
          >
            <MoreHorizontal />
          </Button>
        </Dropdown>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>
          {task.date || "未安排"}
          {task.time ? ` · ${task.time}` : ""}
        </span>
        <TaskCategories task={task} />
      </div>
    </div>
  );
  const dropProps = (target) => ({
    onDragOver: (event) => event.preventDefault(),
    onDrop: (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("task-id");
      if (id) onMove(id, target);
    },
  });
  const scheduled = scoped.filter((t) => t.date);
  const days =
    calendarView === "议程"
      ? dates.filter((date) => scheduled.some((t) => t.date === date))
      : dates;
  return (
    <div className="tool-overlay">
      <div className="tool-window">
        <div className="tool-window-head flex-wrap gap-3">
          <div className="flex items-center flex-wrap gap-3">
            <h2>{names[mode]}</h2>
            <Select
              aria-label="视图清单范围"
              value={scope}
              onChange={setScope}
              style={{ minWidth: 140 }}
              options={[
                { value: "", label: "全部清单" },
                { value: "收件箱", label: "收件箱" },
                ...lists.map(([value]) => ({ value, label: value })),
              ]}
            />
            {mode === "calendar" && (
              <Checkbox
                checked={showFinished}
                onChange={(event) => setShowFinished(event.target.checked)}
              >
                显示已结束
              </Checkbox>
            )}
            <Button
              onClick={() => startCreate(mode === "calendar" ? anchor : "")}
            >
              新建任务
            </Button>
          </div>
          <Button variant="ghost" onClick={onClose}>
            返回任务
          </Button>
        </div>
        {mode === "calendar" ? (
          <>
            <div className="home-calendar-controls flex items-center flex-wrap gap-3 p-3">
              <Select
                aria-label="日历视图"
                value={calendarView}
                onChange={setCalendarView}
                options={["日", "周", "月", "议程"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <Button aria-label="上一段日期" onClick={() => navigateDate(-1)}>
                ‹
              </Button>
              <Button onClick={() => setAnchor(today)}>今天</Button>
              <Button aria-label="下一段日期" onClick={() => navigateDate(1)}>
                ›
              </Button>
              <DatePicker
                aria-label="跳转日期"
                value={dayjs(anchor)}
                allowClear={false}
                onChange={(value) =>
                  value && setAnchor(value.format("YYYY-MM-DD"))
                }
              />
              <strong>
                {calendarView === "月"
                  ? dayjs(anchor).format("YYYY年M月")
                  : calendarView === "日"
                    ? anchor
                    : `${start} — ${dates.at(-1)}`}
              </strong>
            </div>
            <div className="home-view-scroll">
              <div
                className={
                  calendarView === "月"
                    ? "tool-month-grid"
                    : calendarView === "周"
                      ? "tool-calendar-grid"
                      : "home-agenda"
                }
              >
                {calendarView === "月" &&
                  ["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                    <div key={day} className="tool-month-weekday">
                      {day}
                    </div>
                  ))}
                {days.map((date) => (
                  <section
                    key={date}
                    className={`${calendarView === "月" ? "tool-month-day" : "tool-day"} ${date.slice(0, 7) !== anchor.slice(0, 7) ? "is-outside" : ""} ${date === today ? "is-today" : ""}`}
                    {...dropProps(`date:${date}`)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="tool-month-number">
                        {calendarView === "月"
                          ? Number(date.slice(-2))
                          : `${dayjs(date).format("M月D日")} ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][dayjs(date).day()]}`}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`在 ${date} 新建任务`}
                        onClick={() => startCreate(date)}
                      >
                        <Plus />
                      </Button>
                    </div>
                    {scheduled
                      .filter((t) => t.date === date)
                      .sort((a, b) =>
                        (a.time || "99:99").localeCompare(b.time || "99:99"),
                      )
                      .map(card)}
                  </section>
                ))}
              </div>
              {!days.length && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="这段时间没有已安排任务"
                />
              )}
              <section className="home-unscheduled" {...dropProps("未安排")}>
                <h3>
                  未安排{" "}
                  <span className="text-muted-foreground">
                    {scoped.filter((t) => !t.date).length}
                  </span>
                </h3>
                <div className="home-unscheduled-grid">
                  {scoped.filter((t) => !t.date).map(card)}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div
            className={`tool-columns ${mode === "matrix" ? "is-matrix" : mode === "kanban" ? "is-kanban" : "is-timeline"}`}
          >
            {groups.map(([label, items]) => (
              <section
                className="tool-column"
                key={label}
                {...dropProps(label)}
                title={
                  label === "逾期" ? "拖入此栏将到期日改为昨天" : undefined
                }
              >
                <h3>
                  {label}
                  <span>{items.length}</span>
                  {label !== "逾期" &&
                    !["已完成", "已放弃"].includes(label) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`在${label}新建任务`}
                        onClick={() => startCreate("", label)}
                      >
                        <Plus />
                      </Button>
                    )}
                </h3>
                {items.map(card)}
                {!items.length && (
                  <p className="text-xs text-muted-foreground py-3">
                    {label === "逾期"
                      ? "暂无逾期任务，拖入将到期日改为昨天"
                      : "暂无任务，可拖入任务或通过菜单移动"}
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
        <Modal
          open={Boolean(draft)}
          title="新建任务"
          okText="创建"
          cancelText="取消"
          onCancel={() => setDraft(null)}
          onOk={saveDraft}
          okButtonProps={{ disabled: !draft?.title.trim() }}
          destroyOnHidden
        >
          <Input
            autoFocus
            aria-label="新任务标题"
            placeholder="任务标题"
            value={draft?.title || ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
            onPressEnter={(event) => {
              if (!event.nativeEvent.isComposing) saveDraft();
            }}
          />
          <Select
            aria-label="新任务所属清单"
            className="mt-3 w-full"
            value={draft?.list || "收件箱"}
            onChange={(value) =>
              setDraft((current) => ({ ...current, list: value }))
            }
            options={["收件箱", ...lists.map(([name]) => name)].map(
              (value) => ({ value, label: value }),
            )}
          />
          <DatePicker
            aria-label="新任务日期"
            className="mt-3"
            placeholder="未安排日期"
            value={draft?.date ? dayjs(draft.date) : null}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                date: value?.format("YYYY-MM-DD") || "",
                dateExplicit: true,
              }))
            }
          />
        </Modal>
      </div>
    </div>
  );
}

function TaskCategories({ task }) {
  const categories = getTaskCategories(task);
  return (
    <span className="task-category-list" aria-label="所属分类">
      {categories.map((category) => (
        <span className="task-category-badge" key={category}>
          {category}
        </span>
      ))}
    </span>
  );
}

function TaskRow({ task, showCreatedDate, selected, onSelect, onToggle }) {
  return (
    <div
      className={`task-row ${selected ? "is-selected" : ""} ${isFinished(task) ? "is-done" : ""}`}
    >
      <Checkbox
        aria-label={`${isFinished(task) ? "重新打开" : "完成"}任务：${task.title}`}
        checked={Boolean(isFinished(task))}
        onChange={onToggle}
      />
      <button
        type="button"
        className="task-title-button min-w-0 flex-1 truncate text-left"
        data-task-open-id={String(task.id)}
        onClick={onSelect}
        title={task.title}
        aria-label={`打开任务：${task.title}`}
      >
        {task.pinned ? "📌 " : ""}
        {task.title}
      </button>
      {taskStatus(task) === "in-progress" && (
        <span className="text-xs text-primary">进行中</span>
      )}
      {task.status === "abandoned" && (
        <span className="text-xs text-muted-foreground">已放弃</span>
      )}
      {task.date && (
        <span
          className={`text-xs ${!isFinished(task) && task.date < dateKey() ? "text-destructive" : "text-muted-foreground"}`}
        >
          {task.date}
        </span>
      )}
      {task.time && <span className="text-xs text-primary">{task.time}</span>}
      {showCreatedDate && getTaskCreatedDate(task) && (
        <span className="task-created-date">{getTaskCreatedDate(task)}</span>
      )}
      <TaskCategories task={task} />
    </div>
  );
}
export default WelcomePage;
