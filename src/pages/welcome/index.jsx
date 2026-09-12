import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button as AntButton,
  Calendar,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  Menu,
  Modal,
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
  StarFilled as Star,
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
  parseQuickTask,
  taskLists,
  withLists,
  searchTasks,
  selectTasks,
  moveTaskTo,
  toolGroups,
  normalizeSubtasks,
  changeList,
} from "@/utils/taskModel";
import {
  TaskTemplateLibrary,
  TaskAttachments,
  TaskActivity,
  TaskNoteEditor,
} from "./components/TaskExtras";
import {
  TaskSectionManager,
  TaskSectionSelect,
  TrashActions,
} from "./components/TaskOrganization";
import { listSections, taskSection } from "@/utils/taskOrganization";
import {
  resetTaskRecurrence,
  nextOccurrenceDate,
} from "@/utils/taskRecurrence";
import TaskComments from "./components/TaskComments";
import TaskTitleInput from "./components/TaskTitleInput";
import { ReminderEditor, NotificationPanel } from "./components/TaskReminders";
import { pendingReminders } from "@/utils/taskReminders";
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

const INITIAL_DAY = dayjs().format("YYYY-MM-DD");

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
  const {
    tasks,
    lists,
    setTasks,
    setLists,
    updateData,
    syncStatus,
    syncError,
    refresh,
  } = useProductivityData();
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [activeNav, setActiveNav] = useState("today");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(null);
  const unreadCount = pendingReminders(tasks).length;
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
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [tagFilter, setTagFilter] = useState("");
  const [today, setToday] = useState(dateKey);
  useEffect(() => {
    const timer = setInterval(() => setToday(dateKey()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [sortMode, setSortMode] = useState("默认排序");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  useEffect(() => setSubtaskInput(""), [selectedId]);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(INITIAL_DAY);
  const [listEditor, setListEditor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const isTaskView = activeTool === null;
  const tomorrowDate = shiftDate(calendarSelectedDay, 1);
  const upcomingEndDate = shiftDate(calendarSelectedDay, 6);
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
      setTagFilter("");
      setHideCompleted(false);
      setShowDetail(true);
      setSelectedId(task.id);
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
        day: calendarSelectedDay,
        priority: priorityFilter,
        tag: tagFilter,
        hideCompleted,
        sort: sortMode,
      }),
    [
      tasks,
      activeNav,
      calendarSelectedDay,
      priorityFilter,
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
    setActiveNav("all");
    setPriorityFilter("全部");
    setTagFilter("");
    setHideCompleted(false);
    setSelectedId(id);
    setShowDetail(true);
    setSmallDetailOpen(true);
    setActiveTool(null);
  };

  useEffect(() => {
    if (visibleTasks.some((task) => task.id === selectedId)) return;
    setSelectedId(visibleTasks[0]?.id || null);
  }, [selectedId, visibleTasks]);

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
          ? calendarSelectedDay
          : activeNav === "tomorrow"
            ? tomorrowDate
            : ""),
    );
    const createdAt = Date.now();
    const task = {
      id: crypto.randomUUID(),
      createdAt,
      date: parsed.date,
      title: parsed.title || "未命名任务",
      time: parsed.time,
      list: activeNav.startsWith("list:") ? activeNav.slice(5) : "收件箱",
      section: undefined,
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
    setTasks((current) => [task, ...current]);
    const matchesCurrentView =
      selectTasks([task], {
        nav: activeNav,
        day: calendarSelectedDay,
        priority: priorityFilter,
        tag: tagFilter,
        hideCompleted,
      }).length > 0;
    if (!activeTool && !matchesCurrentView) {
      revealTask(task.id);
    } else {
      setSelectedId(task.id);
      setShowDetail(true);
      setSmallDetailOpen(true);
    }
    setInput("");
    return task;
  };
  const toggle = (id) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              done: !task.done,
              status: task.done ? "pending" : "done",
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
  const groupedVisibleTasks = useMemo(() => {
    const groups = new Map(
      currentList
        ? listSections(lists, tasks, currentList).map((label) => [label, []])
        : [],
    );
    visibleTasks
      .filter((task) => !task.done)
      .forEach((task) => {
        const label = taskSection(task, currentList || task.list) || "未分组";
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(task);
      });
    const completedTasks = visibleTasks.filter((task) => task.done);
    if (completedTasks.length > 0) groups.set("已完成", completedTasks);
    return Array.from(groups, ([label, items]) => ({ label, items }));
  }, [visibleTasks, currentList, lists, tasks]);
  const navItems = [
    [
      "all",
      "所有任务",
      ListTodo,
      String(activeTasks.filter((t) => !t.done).length),
    ],
    [
      "overdue",
      "已逾期",
      Timer,
      String(
        activeTasks.filter((t) => !t.done && t.date && t.date < today).length,
      ),
    ],
    [
      "today",
      "今天",
      CalendarDays,
      String(
        activeTasks.filter((t) => !t.done && t.date === calendarSelectedDay)
          .length,
      ),
    ],
    [
      "upcoming",
      "最近7天",
      CalendarDays,
      String(
        activeTasks.filter(
          (t) =>
            !t.done &&
            t.date >= calendarSelectedDay &&
            t.date <= upcomingEndDate,
        ).length,
      ),
    ],
    [
      "inbox",
      "收件箱",
      Inbox,
      String(
        activeTasks.filter(
          (t) => !t.done && getTaskCategories(t).includes("收件箱"),
        ).length,
      ),
    ],
  ];
  const saveList = () => {
    const nextLabel = listEditor?.value?.trim();
    if (
      !nextLabel ||
      nextLabel === "收件箱" ||
      lists.some(
        ([label]) => label === nextLabel && label !== listEditor.previousLabel,
      )
    ) {
      toast({
        description: "清单名称不能为空、重复或使用保留名称“收件箱”",
        variant: "destructive",
      });
      return;
    }
    if (listEditor.previousLabel) {
      const previous = listEditor.previousLabel;
      setLists((current) =>
        current.map((item) =>
          item[0] === previous ? [nextLabel, ...item.slice(1)] : item,
        ),
      );
      setTasks((current) => changeList(current, previous, nextLabel));
      if (activeNav === `list:${previous}`) setActiveNav(`list:${nextLabel}`);
    } else setLists((current) => [...current, [nextLabel, "0"]]);
    setListEditor(null);
  };
  const executeConfirmedAction = () => {
    if (confirmAction?.type === "delete-list") {
      const label = confirmAction.label;
      setLists((current) => current.filter((item) => item[0] !== label));
      setTasks((current) => changeList(current, label, null));
      if (activeNav === `list:${label}`) setActiveNav("today");
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
    if (!selected.id) return;
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
    setSelectedId(copy.id);
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
    if (!selected.id) return;
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
        "已复制任务链接",
      );
    } else if (key === "print") {
      window.print();
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
      setExtrasOpen("templates");
    } else if (key === "activity" || key === "attachment") {
      setExtrasOpen(key);
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
                              !task.done &&
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
                        <span>已完成</span>
                        <span className="task-menu-count">
                          {
                            tasks.filter((task) => task.done && !task.deleted)
                              .length
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
                    { value: "completed", label: "已完成" },
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
                      {formatDateLabel(calendarSelectedDay)}
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
                                  ? "已完成"
                                  : activeNav === "trash"
                                    ? "垃圾桶"
                                    : activeNav.startsWith("list:")
                                      ? activeNav.slice(5)
                                      : "今天"}{" "}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {activeNav === "completed"
                        ? visibleTasks.length
                        : visibleTasks.filter((t) => !t.done).length}
                    </span>
                  </h1>
                </div>
                <div className="task-main-actions flex-wrap">
                  {currentList && (
                    <TaskSectionManager
                      listName={currentList}
                      lists={lists}
                      tasks={tasks}
                      onChange={updateData}
                    />
                  )}
                  <Button onClick={() => setExtrasOpen("templates")}>
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
                          onClick: () => setShowDetail((value) => !value),
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
                          label: "分享",
                          onClick: () =>
                            copyText(
                              window.location.href,
                              "已复制首页链接",
                              "分享链接复制失败",
                            ),
                        },
                        {
                          key: "activity",
                          label: "清单动态",
                          onClick: () => setExtrasOpen("list-activity"),
                        },
                        {
                          key: "print",
                          label: "打印",
                          onClick: () => window.print(),
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
                      {tasks.filter((t) => !t.done && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-green">
                    <div className="text-xs text-success">已完成</div>
                    <div className="mt-1 text-2xl font-semibold text-success">
                      {tasks.filter((t) => t.done && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-orange">
                    <div className="text-xs text-warning">今日任务</div>
                    <div className="mt-1 text-2xl font-semibold text-warning">
                      {
                        tasks.filter(
                          (t) => t.date === calendarSelectedDay && !t.deleted,
                        ).length
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
                        : priorityFilter !== "全部" || tagFilter
                          ? "没有符合筛选条件的任务"
                          : "这里还没有任务，按 N 快速添加"
                  }
                />
              )}
              {groupedVisibleTasks.map(({ label, items }) => (
                <div className="task-section" key={label}>
                  {(() => {
                    const sectionKey = `tasks:${label}`;
                    const isHeaderless = [
                      "更多任务",
                      "任务",
                      "未分组",
                    ].includes(label);
                    const isCollapsed = isHeaderless
                      ? false
                      : (collapsedSections[sectionKey] ?? label === "已完成");
                    return (
                      <>
                        {!isHeaderless && (
                          <div
                            className="task-section-title"
                            role="button"
                            tabIndex={0}
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleSection(sectionKey)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleSection(sectionKey);
                              }
                            }}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                            />
                            <span>{label}</span>
                            <span className="text-xs text-muted-foreground">
                              {items.length}
                            </span>
                            {activeNav.startsWith("list:") &&
                              label !== "已完成" && (
                                <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
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
                              onSelect={() => {
                                setSelectedId(task.id);
                                setShowDetail(true);
                                setSmallDetailOpen(true);
                              }}
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
              ))}
            </main>
          )}
          {isTaskView && showDetail && selected.id && (
            <aside className="task-detail">
              <div className="task-detail-toolbar">
                <Button
                  className="ml-auto"
                  aria-label="关闭任务详情"
                  onClick={() => {
                    setSmallDetailOpen(false);
                    setShowDetail(false);
                  }}
                >
                  关闭
                </Button>
                <div className="flex items-center gap-2">
                  <Checkbox
                    className="task-detail-top-checkbox"
                    checked={selected.done}
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
                                    none: "",
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
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="task-detail-checkbox"
                    checked={selected.done}
                    onChange={() => toggle(selected.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <TaskTitleInput
                      task={selected}
                      onCommit={(title) => updateSelected({ title })}
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
                <div id="task-note-editor">
                  <TaskNoteEditor
                    value={selected.detail || ""}
                    onChange={(detail) => updateSelected({ detail })}
                    ariaLabel="任务备注"
                  />
                </div>
                {selected.deleted && (
                  <div className="my-4">
                    <TrashActions
                      tasks={tasks}
                      onChange={setTasks}
                      taskId={selected.id}
                    />
                  </div>
                )}
                <div className="mt-8 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span>清单</span>
                    <Select
                      aria-label="所属清单"
                      value={selected.list}
                      options={["收件箱", ...lists.map(([label]) => label)].map(
                        (value) => ({ value, label: value }),
                      )}
                      onChange={(value) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? withLists(task, [value])
                              : task,
                          ),
                        )
                      }
                      style={{ minWidth: 150 }}
                    />
                  </div>
                  <div className="py-2">
                    <label className="block mb-2 text-sm">分组</label>
                    <TaskSectionSelect
                      task={selected}
                      listName={currentList || selected.list}
                      lists={lists}
                      tasks={tasks}
                      onChange={setTasks}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span>状态</span>
                    <Select
                      aria-label="任务状态"
                      value={
                        selected.status || (selected.done ? "done" : "pending")
                      }
                      options={[
                        { value: "pending", label: "待处理" },
                        { value: "in-progress", label: "进行中" },
                        { value: "done", label: "已完成" },
                        { value: "abandoned", label: "已放弃" },
                      ]}
                      onChange={(status) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? {
                                  ...task,
                                  status,
                                  done: ["done", "abandoned"].includes(status),
                                }
                              : task,
                          ),
                        )
                      }
                      style={{ minWidth: 150 }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span>时间</span>
                    <Input
                      aria-label="任务时间"
                      type="time"
                      value={selected.time || ""}
                      onChange={(event) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? {
                                  ...task,
                                  time: event.target.value,
                                  date: task.date || today,
                                }
                              : task,
                          ),
                        )
                      }
                      style={{ width: 150 }}
                    />
                  </div>
                  <DetailRow
                    icon={Star}
                    label="优先级"
                    value={selected.priority}
                  />
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">日期</span>
                    <Input
                      type="date"
                      className="ml-auto h-8 w-32 text-xs"
                      value={selected.date || ""}
                      onChange={(e) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? { ...task, date: e.target.value }
                              : task,
                          ),
                        )
                      }
                    />
                  </div>
                  <ReminderEditor task={selected} onChange={updateSelected} />
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">重复</span>
                    <Select
                      className="ml-auto w-32"
                      size="small"
                      value={selected.repeat || ""}
                      options={[
                        { value: "", label: "不重复" },
                        { value: "每天", label: "每天" },
                        { value: "每周一", label: "每周一" },
                        { value: "每周", label: "每周" },
                        { value: "每月", label: "每月" },
                      ]}
                      onChange={(value) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? {
                                  ...task,
                                  repeat: value,
                                  date: value ? task.date || today : task.date,
                                }
                              : task,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                {selected.repeat && (
                  <p className="text-xs text-muted-foreground mt-2">
                    完成后创建下一次：{nextOccurrenceDate(selected, today)}
                    。取消本次完成不会删除已生成的后续任务。
                  </p>
                )}
                {selected.recurrenceNextId && (
                  <div className="mt-2">
                    {tasks.some(
                      (task) =>
                        String(task.id) === String(selected.recurrenceNextId) &&
                        !task.deleted,
                    ) ? (
                      <Button
                        size="sm"
                        onClick={() => revealTask(selected.recurrenceNextId)}
                      >
                        查看下次任务
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        下次任务已移除，不会重复生成。
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-5">
                  <div className="mb-2 text-xs text-muted-foreground">标签</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.tags?.map((tag) => (
                      <AntTag
                        key={tag}
                        closable
                        onClose={() =>
                          setTasks((current) =>
                            current.map((task) =>
                              task.id === selected.id
                                ? {
                                    ...task,
                                    tags: task.tags.filter(
                                      (item) => item !== tag,
                                    ),
                                  }
                                : task,
                            ),
                          )
                        }
                      >
                        #{tag}
                      </AntTag>
                    ))}
                    <Input
                      className="h-7 w-24 text-xs"
                      placeholder="添加标签"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          const tag = e.currentTarget.value
                            .trim()
                            .replace(/^#/, "");
                          setTasks((current) =>
                            current.map((task) =>
                              task.id === selected.id
                                ? {
                                    ...task,
                                    tags: [
                                      ...new Set([...(task.tags || []), tag]),
                                    ],
                                  }
                                : task,
                            ),
                          );
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                </div>
                {
                  <div className="mt-6">
                    <div className="mb-2 text-sm font-medium text-foreground">
                      子任务
                    </div>
                    {normalizeSubtasks(selected).map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 py-1"
                      >
                        <Checkbox
                          aria-label={`完成子任务：${item.title}`}
                          checked={item.done}
                          onChange={(event) =>
                            setTasks((current) =>
                              current.map((task) =>
                                task.id === selected.id
                                  ? {
                                      ...task,
                                      subtasks: normalizeSubtasks(task).map(
                                        (sub, i) =>
                                          i === index
                                            ? {
                                                ...sub,
                                                done: event.target.checked,
                                              }
                                            : sub,
                                      ),
                                    }
                                  : task,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label={`子任务 ${index + 1}`}
                          value={item.title}
                          variant="borderless"
                          style={{
                            textDecoration: item.done ? "line-through" : "none",
                          }}
                          onChange={(event) =>
                            setTasks((current) =>
                              current.map((task) =>
                                task.id === selected.id
                                  ? {
                                      ...task,
                                      subtasks: normalizeSubtasks(task).map(
                                        (sub, i) =>
                                          i === index
                                            ? {
                                                ...sub,
                                                title: event.target.value,
                                              }
                                            : sub,
                                      ),
                                    }
                                  : task,
                              ),
                            )
                          }
                        />
                        <Button
                          aria-label={`删除子任务：${item.title}`}
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setTasks((current) =>
                              current.map((task) =>
                                task.id === selected.id
                                  ? {
                                      ...task,
                                      subtasks: normalizeSubtasks(task).filter(
                                        (_, i) => i !== index,
                                      ),
                                    }
                                  : task,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-8 text-xs"
                        placeholder="添加子任务，回车保存"
                        value={subtaskInput}
                        onChange={(e) => setSubtaskInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && subtaskInput.trim()) {
                            const value = subtaskInput.trim();
                            setTasks((current) =>
                              current.map((task) =>
                                task.id === selected.id
                                  ? {
                                      ...task,
                                      subtasks: [
                                        ...(task.subtasks || []),
                                        {
                                          id: crypto.randomUUID(),
                                          title: value,
                                          done: false,
                                        },
                                      ],
                                    }
                                  : task,
                              ),
                            );
                            setSubtaskInput("");
                          }
                        }}
                      />
                    </div>
                  </div>
                }
              </div>
              <div className="task-calendar">
                <Calendar
                  className="task-antd-calendar"
                  fullscreen={false}
                  value={dayjs(calendarSelectedDay)}
                  onSelect={(value) =>
                    setCalendarSelectedDay(value.format("YYYY-MM-DD"))
                  }
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
                    onClick={() =>
                      document
                        .querySelector("#task-note-editor textarea")
                        ?.focus()
                    }
                    aria-label="编辑备注"
                  >
                    <TextFormat className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="评论"
                    title="添加评论"
                    onClick={() => setExtrasOpen("comments")}
                  >
                    <Comment className="h-5 w-5" />
                  </Button>
                  <Dropdown
                    trigger={["click"]}
                    placement="topRight"
                    menu={{
                      items: [
                        { key: "subtask", label: "添加子任务" },
                        { key: "pin", label: "置顶" },
                        { key: "abandon", label: "放弃" },
                        { key: "tag", label: "标签" },
                        { key: "attachment", label: "上传附件" },
                        { type: "divider" },
                        { key: "activity", label: "任务动态" },
                        { key: "template", label: "保存为模板" },
                        { key: "duplicate", label: "创建副本" },
                        { key: "copy", label: "复制链接" },
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
            baseDate={calendarSelectedDay}
            onClose={() => setActiveTool(null)}
            onCreate={addTask}
            onMove={moveTask}
            onSelect={revealTask}
          />
        )}
        <TaskTemplateLibrary
          open={extrasOpen === "templates"}
          onClose={() => setExtrasOpen(null)}
          sourceTask={selected.id ? selected : null}
          lists={lists.map(([name]) => name)}
          onFeedback={toast}
          onCreateTask={(task) => {
            const fresh = resetTaskRecurrence(task);
            setTasks((current) => [fresh, ...current]);
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
              "list-activity": "清单动态",
              comments: "任务评论",
            }[extrasOpen]
          }
          footer={null}
          onCancel={() => setExtrasOpen(null)}
          destroyOnHidden
          width={560}
        >
          {extrasOpen === "activity" && <TaskActivity task={selected} />}
          {extrasOpen === "list-activity" && (
            <TaskActivity
              task={{
                activity: visibleTasks.flatMap((task) =>
                  (task.activity || []).map((event) => ({
                    ...event,
                    message: `${task.title} · ${event.message}`,
                  })),
                ),
              }}
            />
          )}
          {extrasOpen === "attachment" && (
            <TaskAttachments
              key={selected.id}
              task={selected}
              onChange={(attachments) => updateSelected({ attachments })}
              onFeedback={toast}
            />
          )}
          {extrasOpen === "comments" && (
            <TaskComments
              key={selected.id}
              task={selected}
              onChange={updateSelected}
            />
          )}
        </Modal>
        <NotificationPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
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
            onPressEnter={saveList}
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
              ? "清单中的任务将移入收件箱。"
              : "你可以在垃圾桶中恢复此任务。"}
          </p>
        </Modal>
        <Modal
          open={searchOpen}
          title="搜索全部任务、备注或标签"
          footer={null}
          onCancel={() => setSearchOpen(false)}
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
      (mode === "kanban" || showFinished || !t.done),
  );
  const groups = toolGroups(scoped, mode, today);
  const names = {
    calendar: "日历",
    timeline: "时间线",
    matrix: "四象限",
    kanban: "看板",
  };
  const navigateDate = (direction) =>
    setAnchor(
      dayjs(anchor)
        .add(
          direction,
          calendarView === "日"
            ? "day"
            : calendarView === "周"
              ? "week"
              : "month",
        )
        .format("YYYY-MM-DD"),
    );
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
      target,
      dateExplicit: Boolean(initialDate) || target === "未安排",
    });
  };
  const saveDraft = () => {
    if (!draft?.title.trim()) return;
    const overrides = moveTaskTo(
      { list: scope || "收件箱", tags: [], priority: "无" },
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
        mode === "calendar" &&
        created.date &&
        !dates.includes(created.date)
      ) {
        onSelect(created.id);
      }
    }
  };
  const card = (task) => (
    <div
      className={`tool-task ${task.done ? "is-done" : ""}`}
      key={task.id}
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData("task-id", String(task.id))
      }
    >
      <div className="flex items-start gap-2">
        <Checkbox
          aria-label={`完成任务：${task.title}`}
          checked={task.done}
          onChange={() => onMove(task.id, task.done ? "待处理" : "已完成")}
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
                    暂无任务，可拖入任务或通过菜单移动
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
            onPressEnter={saveDraft}
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
      role="button"
      tabIndex={0}
      className={`task-row ${selected ? "is-selected" : ""} ${task.done ? "is-done" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
    >
      <Checkbox
        checked={task.done}
        onClick={(event) => event.stopPropagation()}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1 truncate text-left">
        {task.pinned ? "📌 " : ""}
        {task.title}
      </span>
      {task.status === "abandoned" && (
        <span className="text-xs text-muted-foreground">已放弃</span>
      )}
      {task.date && (
        <span
          className={`text-xs ${!task.done && task.date < dateKey() ? "text-destructive" : "text-muted-foreground"}`}
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
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto text-foreground">{value}</span>
    </div>
  );
}
export default WelcomePage;
