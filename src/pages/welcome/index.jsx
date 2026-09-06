import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button as AntButton,
  Calendar,
  Card,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  Menu,
  Modal,
  Select,
  Tag as AntTag,
  theme as antdTheme,
} from "antd";
import zhCN from "antd/locale/zh_CN";
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
import { invoke, isTauri } from "@tauri-apps/api/core";

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

const seedTasks = [
  ["✅ 点击输入框，创建任务", "新手入门"],
  ["📋 用清单来管理任务", "新手入门"],
  ["📅 日历：日程安排一目了然", "功能模块"],
  ["🎯 四象限：提升效率利器", "功能模块"],
  ["🍅 番茄专注：拯救拖延症", "功能模块"],
  ["⏰ 习惯打卡：见证坚持与成长", "功能模块"],
  ["📊 看板、时间线视图：可视化管理", "探索更多"],
  ["🔖 桌面便签：随时记录想法", "探索更多"],
  ["🔗 订阅日历：不再错过重要日程", "探索更多"],
  ["✨ 更多特色功能", "探索更多"],
  ["💎 高级会员", "探索更多"],
  ["💡 帮助中心", "探索更多"],
].map(([title, section], index) => ({
  id: index + 1,
  date: "",
  title,
  time: "",
  list: "👋欢迎",
  section,
  priority: "中",
  done: false,
  tags: ["欢迎"],
  reminder: "",
  repeat: "",
  subtasks: [],
  detail:
    title === "✨ 更多特色功能"
      ? "我们还有这些特色功能：\n\n• 全平台支持：不管是手机、电脑，还是手表，几乎所有常用设备都支持。\n\n• 共享协作：邀请同事加入清单，轻松指派任务给成员。\n\n• 标签与过滤器：按自己的方式分类、筛选任务。\n\n• 摘要：快速掌握一段时间内的任务完成情况。"
      : "了解滴答清单的功能，开始安排你的任务。",
}));

const defaultLists = [
  ["👋欢迎", "12"],
  ["💼工作任务", "0"],
  ["🏠个人备忘", "0"],
  ["🦄心愿清单", "0"],
  ["📦购物清单", "0"],
  ["📖学习安排", "0"],
  ["🏃锻炼计划", "0"],
];

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

function parseTaskInput(rawTitle, baseDate) {
  let title = rawTitle.trim();
  let date = baseDate;
  if (title.includes("后天")) {
    date = shiftDate(baseDate, 2);
    title = title.replace("后天", "");
  } else if (title.includes("明天")) {
    date = shiftDate(baseDate, 1);
    title = title.replace("明天", "");
  } else if (title.includes("今天")) {
    title = title.replace("今天", "");
  }

  // 只把明确的时间表达式解析为时间，避免“买2个苹果”这类标题被误判为 02:00。
  const timeMatch = title.match(
    /(?:(上午|下午)\s*(\d{1,2})(?:[:：点](\d{1,2}))?)|(\d{1,2})[:：点](\d{1,2})/,
  );
  let time = "";
  if (timeMatch) {
    let hour = Number(timeMatch[2] ?? timeMatch[4]);
    const minute = Number(timeMatch[3] ?? timeMatch[5] ?? 0);
    if (timeMatch[1] === "下午" && hour < 12) hour += 12;
    if (timeMatch[1] === "上午" && hour === 12) hour = 0;
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    title = title.replace(timeMatch[0], "");
  }

  return { date, time, title: title.replace(/^[，,：:\s]+|[，,：:\s]+$/g, "") };
}

function getTaskCategories(task) {
  const values = Array.isArray(task?.lists) && task.lists.length
    ? task.lists
    : Array.isArray(task?.categories) && task.categories.length
      ? task.categories
      : [task?.list];
  return [...new Set(values.filter(Boolean))];
}

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
  const [searchParams] = useSearchParams();
  const { addTab } = useAppStore();
  const { toast } = useToast();
  const [tasks, setTasks] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("runproject-tasks"));
      if (!Array.isArray(stored) || stored.length === 0) return seedTasks;
      return stored.map((task) => ({
        ...task,
        id: task.id ?? `${Date.now()}-${Math.random()}`,
        title: task.title || "未命名任务",
        list: task.list || "收件箱",
        createdAt: task.createdAt ?? task.createdDate ?? null,
        priority: task.priority ?? "中",
        done: Boolean(task.done),
        deleted: Boolean(task.deleted),
        tags: Array.isArray(task.tags) ? task.tags : [],
        subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
        section: task.section || "任务",
        date:
          task.list === "👋欢迎" && task.title === "✨ 更多特色功能"
            ? ""
            : task.date || "",
      }));
    } catch {
      return seedTasks;
    }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [activeNav, setActiveNav] = useState("today");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [sortMode, setSortMode] = useState("默认排序");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [formatToolbarOpen, setFormatToolbarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(INITIAL_DAY);
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [listEditor, setListEditor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [lists, setLists] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("runproject-lists"));
      return stored?.some(([label]) => label === "👋欢迎")
        ? stored
        : defaultLists;
    } catch {
      return defaultLists;
    }
  });
  const [databaseStatus, setDatabaseStatus] = useState(() =>
    isTauri() ? "loading" : "local",
  );
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
    if (databaseStatus === "local" || databaseStatus === "fallback") {
      localStorage.setItem("runproject-tasks", JSON.stringify(tasks));
    }
  }, [databaseStatus, tasks]);
  useEffect(() => {
    if (databaseStatus === "local" || databaseStatus === "fallback") {
      localStorage.setItem("runproject-lists", JSON.stringify(lists));
    }
  }, [databaseStatus, lists]);
  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    const loadDatabase = async () => {
      try {
        const data = await invoke("load_productivity_data");
        if (cancelled) return;
        if (data?.initialized) {
          if (Array.isArray(data.tasks)) setTasks(data.tasks);
          if (Array.isArray(data.lists) && data.lists.length > 0) {
            setLists(data.lists);
          }
        } else {
          // 首次启动：将旧 localStorage 数据一次性迁移到 SQLite。
          await invoke("save_productivity_data", { tasks, lists });
        }
        if (!cancelled) setDatabaseStatus("ready");
      } catch (error) {
        console.error("SQLite 任务数据读写失败，回退到本地缓存:", error);
        if (!cancelled) setDatabaseStatus("fallback");
      }
    };
    loadDatabase();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (databaseStatus !== "ready") return;
    invoke("save_productivity_data", { tasks, lists }).catch((error) => {
      console.error("保存 SQLite 任务数据失败:", error);
      setDatabaseStatus("fallback");
    });
  }, [databaseStatus, lists, tasks]);
  useEffect(() => {
    const taskId = Number(searchParams.get("task"));
    if (taskId && tasks.some((task) => task.id === taskId)) setSelectedId(taskId);
  }, [searchParams, tasks]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setIsDarkMode(media.matches);
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);
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
        tag !== "TEXTAREA"
      ) {
        event.preventDefault();
        document.getElementById("task-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = tasks.filter((task) =>
      activeNav === "trash" ? task.deleted : !task.deleted,
    );

    if (activeNav === "today") {
      list = list.filter(
        (task) =>
          task.date === calendarSelectedDay &&
          (!task.done || task.date >= INITIAL_DAY),
      );
    } else if (activeNav === "tomorrow") {
      list = list.filter((task) => task.date === tomorrowDate);
    } else if (activeNav === "upcoming") {
      list = list.filter(
        (task) =>
          task.date >= calendarSelectedDay && task.date <= upcomingEndDate,
      );
    } else if (activeNav === "completed") {
      list = list.filter((task) => task.done);
    } else if (activeNav === "inbox") {
      // 收件箱只保留尚未归入具体清单的未完成任务。
      list = list.filter(
        (task) => getTaskCategories(task).includes("收件箱") && !task.done,
      );
    } else if (activeNav.startsWith("list:")) {
      list = list.filter((task) =>
        getTaskCategories(task).includes(activeNav.slice(5)),
      );
    }

    if (priorityFilter !== "全部") {
      list = list.filter((task) => task.priority === priorityFilter);
    }
    if (hideCompleted && activeNav !== "completed") {
      list = list.filter((task) => !task.done);
    }
    if (query) {
      list = list.filter((task) =>
        `${task.title} ${getTaskCategories(task).join(" ")} ${task.detail} ${(task.tags || []).join(" ")}`
          .toLowerCase()
          .includes(query),
      );
    }
    return [...list].sort((a, b) => {
      if (sortMode === "优先级") {
        const rank = { 高: 0, 中: 1, 低: 2, "": 3 };
        return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
      }
      if (sortMode === "时间") {
        return `${a.date || "9999-99-99"} ${a.time || "99:99"}`.localeCompare(
          `${b.date || "9999-99-99"} ${b.time || "99:99"}`,
        );
      }
      return 0;
    });
  }, [
    activeNav,
    calendarSelectedDay,
    priorityFilter,
    hideCompleted,
    search,
    sortMode,
    tasks,
    tomorrowDate,
    upcomingEndDate,
  ]);

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
      tags: ["开发"],
      reminder: "",
      repeat: "",
      subtasks: [],
      detail: "从左侧或上方添加一个任务。",
    };
  const addTask = (value = input) => {
    const title = String(value).trim();
    if (!title) return;
    if (activeNav === "completed" || activeNav === "trash") {
      toast({ description: "请先选择今天、清单或收件箱再创建任务" });
      return;
    }
    // 新建任务默认使用实际创建日；“最近 7 天”只负责统计，不改变任务日期。
    const parsed = parseTaskInput(title, dayjs().format("YYYY-MM-DD"));
    const createdAt = Date.now();
    const task = {
      id: createdAt,
      createdAt,
      date: parsed.date,
      title: parsed.title || "未命名任务",
      time: parsed.time,
      list: activeNav.startsWith("list:") ? activeNav.slice(5) : "收件箱",
      section: undefined,
      priority: "中",
      done: false,
      status: "pending",
      tags: ["开发"],
      reminder: "",
      repeat: "",
      subtasks: [],
      detail: "新建任务，点击右侧可补充详情。",
    };
    setTasks((current) => [task, ...current]);
    setSelectedId(task.id);
    setInput("");
  };
  const toggle = (id) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  const open = (id) => {
    addTab(id);
    navigate(PAGE_CONFIGS[id].path);
  };
  const moveTask = (id, target) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task;
        const next = { ...task };
        if (target.startsWith("date:")) next.date = target.slice(5);
        if (target.startsWith("day:"))
          next.date = shiftDate(calendarSelectedDay, Number(target.slice(4)));
        if (target === "今天") next.date = calendarSelectedDay;
        if (target === "明天") next.date = tomorrowDate;
        if (target === "以后") next.date = shiftDate(calendarSelectedDay, 2);
        if (target === "已完成") {
          next.done = true;
          next.status = "done";
        }
        if (target === "待处理") {
          next.done = false;
          next.status = "pending";
        }
        if (target === "进行中") {
          next.done = false;
          next.status = "in-progress";
        }
        if (target.includes("重要且紧急")) next.priority = "高";
        if (target.includes("重要不紧急") || target.includes("不重要但紧急"))
          next.priority = "中";
        if (target === "其他") next.priority = "低";
        return next;
      }),
    );
  };
  const activeTasks = tasks.filter((task) => !task.deleted);
  const groupedVisibleTasks = useMemo(() => {
    const groups = new Map();
    visibleTasks.filter((task) => !task.done).forEach((task) => {
      const label = task.section || (task.time ? "今天" : "更多任务");
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(task);
    });
    const completedTasks = visibleTasks.filter((task) => task.done);
    if (completedTasks.length > 0) groups.set("已完成", completedTasks);
    return Array.from(groups, ([label, items]) => ({ label, items }));
  }, [visibleTasks]);
  const navItems = [
    [
      "today",
      "今天",
      CalendarDays,
      String(
          activeTasks.filter(
          (t) => !t.done && t.date === calendarSelectedDay,
        ).length,
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
    if (!nextLabel) return;
    if (listEditor.previousLabel) {
      const previousLabel = listEditor.previousLabel;
      setLists((current) =>
        current.map((item) =>
          item[0] === previousLabel ? [nextLabel, item[1]] : item,
        ),
      );
      setTasks((current) =>
        current.map((task) =>
          getTaskCategories(task).includes(previousLabel)
            ? {
                ...task,
                list: nextLabel,
                ...(Array.isArray(task.lists)
                  ? {
                      lists: getTaskCategories(task).map((value) =>
                        value === previousLabel ? nextLabel : value,
                      ),
                    }
                  : {}),
              }
            : task,
        ),
      );
      if (activeNav === `list:${previousLabel}`)
        setActiveNav(`list:${nextLabel}`);
    } else if (!lists.some(([label]) => label === nextLabel)) {
      setLists((current) => [...current, [nextLabel, "0"]]);
    }
    setListEditor(null);
  };
  const executeConfirmedAction = () => {
    if (confirmAction?.type === "delete-list") {
      const label = confirmAction.label;
      setLists((current) => current.filter((item) => item[0] !== label));
      setTasks((current) =>
        current.map((task) =>
          getTaskCategories(task).includes(label)
            ? {
                ...task,
                list: "收件箱",
                ...(Array.isArray(task.lists)
                  ? {
                      lists: getTaskCategories(task).filter(
                        (value) => value !== label,
                      ),
                    }
                  : {}),
              }
            : task,
        ),
      );
      if (activeNav === `list:${label}`) setActiveNav("today");
    }
    if (confirmAction?.type === "delete-task") {
      setTasks((current) => current.map((task) =>
        task.id === confirmAction.id ? { ...task, deleted: true } : task,
      ));
      setSelectedId(null);
    }
    setConfirmAction(null);
  };
  const duplicateTask = () => {
    if (!selected.id) return;
    const copy = {
      ...selected,
      id: Date.now(),
      title: `${selected.title}（副本）`,
      done: false,
      status: "pending",
    };
    setTasks((current) => [copy, ...current]);
    setSelectedId(copy.id);
    toast({ description: "已创建任务副本" });
  };
  const copyText = (value, success, failure = "复制失败") =>
    Promise.resolve(navigator.clipboard?.writeText(value))
      .then(() => toast({ description: success }))
      .catch(() => toast({ description: failure, variant: "destructive" }));
  const handleTaskAction = ({ key }) => {
    if (!selected.id) return;
    if (key === "subtask") {
      document.querySelector('input[placeholder="添加子任务，回车保存"]')?.focus();
    } else if (key === "pin") {
      setTasks((current) => current.map((task) => task.id === selected.id ? { ...task, pinned: !task.pinned } : task));
      toast({ description: selected.pinned ? "已取消置顶" : "任务已置顶" });
    } else if (key === "abandon") {
      setTasks((current) => current.map((task) => task.id === selected.id ? { ...task, done: true, status: "abandoned" } : task));
      toast({ description: "任务已标记为放弃" });
    } else if (key === "tag") {
      document.querySelector('input[placeholder="添加标签"]')?.focus();
    } else if (key === "duplicate") {
      duplicateTask();
    } else if (key === "copy") {
      copyText(`${window.location.href.split("#")[0]}#/welcome?task=${selected.id}`, "已复制任务链接");
    } else if (key === "print") {
      window.print();
    } else if (key === "delete") {
      setConfirmAction({ type: "delete-task", id: selected.id });
    } else if (key === "restore") {
      setTasks((current) => current.map((task) => task.id === selected.id ? { ...task, deleted: false } : task));
      toast({ description: "任务已恢复" });
    } else if (key === "template") {
      try {
        const templates = JSON.parse(localStorage.getItem("runproject-templates") || "[]");
        localStorage.setItem("runproject-templates", JSON.stringify([
          ...templates.filter((template) => template.title !== selected.title),
          { title: selected.title, detail: selected.detail || "", subtasks: selected.subtasks || [], savedAt: Date.now() },
        ]));
        toast({ description: "模板已保存" });
      } catch {
        toast({ description: "模板保存失败", variant: "destructive" });
      }
    } else if (key === "activity" || key === "attachment") {
      toast({ description: key === "activity" ? "暂无任务动态" : "附件功能将在后续版本提供" });
    }
  };
  const handleRailAction = (label) => {
    if (label === "同步") {
      setTasks((current) => [...current]);
      toast({ description: "任务已同步" });
    } else if (label === "通知") {
      toast({ description: "暂无新通知" });
    } else if (label === "帮助") {
      toast({ description: "快捷键：N 新建任务，⌘/Ctrl+K 搜索" });
    }
  };
  const handleRichLink = (action) => {
    if (action === "tag") {
      document.querySelector('input[placeholder="添加标签"]')?.focus();
    } else if (action === "filter") {
      setCollapsedSections((current) => ({ ...current, filters: false }));
    } else if (action === "summary") {
      setActiveNav("summary");
    } else if (action === "shortcut") {
      setSearchOpen(true);
    } else {
      toast({ description: "该帮助内容将在后续版本提供" });
    }
  };
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDarkMode
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#4f7df3",
          borderRadius: 10,
          fontFamily: "inherit",
        },
      }}
    >
      <div
        className={`task-home h-full overflow-hidden ${isTaskView ? "is-task-view" : "is-tool-view"}`}
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
                aria-label={label}
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
                  aria-label={label}
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
                    <span className="ml-auto text-xs text-gray-400">
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
                    根据清单、时间、优先级、标签等过滤出特定的任务
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
                    以标签的维度展示不同清单的任务，输入 # 快速选择标签
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
                          {tasks.filter((task) => task.done && !task.deleted).length}
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
              <div className="task-main-header">
                <div>
                  {!activeNav.startsWith("list:") && (
                    <p className="text-xs font-medium text-blue-500">
                      {formatDateLabel(calendarSelectedDay)}
                    </p>
                  )}
                  <h1 className="mt-1 text-2xl font-bold text-gray-900">
                    {activeNav === "inbox"
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
                    <span className="ml-1 text-sm font-normal text-gray-400">
                      {activeNav === "completed"
                        ? visibleTasks.length
                        : visibleTasks.filter((t) => !t.done).length}
                    </span>
                  </h1>
                </div>
                <div className="task-main-actions">
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
                        { key: "settings", label: "显示设置", onClick: () => open("settings") },
                        { type: "divider" },
                        { key: "add-group", label: "添加分组", onClick: () => setListEditor({ previousLabel: "", value: "" }) },
                        { key: "share", label: "分享", onClick: () => copyText(window.location.href, "已复制首页链接", "分享链接复制失败") },
                        { key: "activity", label: "清单动态", onClick: () => toast({ description: "暂无清单动态" }) },
                        { key: "print", label: "打印", onClick: () => window.print() },
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
                    <div className="text-xs text-blue-600">待完成</div>
                    <div className="mt-1 text-2xl font-bold text-blue-900">
                      {tasks.filter((t) => !t.done && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-green">
                    <div className="text-xs text-emerald-600">已完成</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-900">
                      {tasks.filter((t) => t.done && !t.deleted).length}
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-orange">
                    <div className="text-xs text-orange-600">今日任务</div>
                    <div className="mt-1 text-2xl font-bold text-orange-900">
                      {
                        tasks.filter(
                          (t) => t.date === calendarSelectedDay && !t.deleted,
                        ).length
                      }
                    </div>
                  </Card>
                  <Card size="small" className="task-summary-card is-violet">
                    <div className="text-xs text-violet-600">垃圾桶</div>
                    <div className="mt-1 text-2xl font-bold text-violet-900">
                      {tasks.filter((t) => t.deleted).length}
                    </div>
                  </Card>
                </div>
              )}
              <div className="task-quick-add">
                <Plus className="h-4 w-4 text-gray-400" />
                <Input
                  id="task-input"
                  placeholder={
                    activeNav.startsWith("list:")
                      ? `添加任务至“${activeNav.slice(5)}”，回车即可创建`
                      : '添加任务，试试输入“明天下午3点开会”'
                  }
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={() => addTask()}
                />
              </div>
              {visibleTasks.length === 0 && (
                <Empty
                  className="task-empty"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="这里还没有任务，按 N 快速添加"
                />
              )}
              {groupedVisibleTasks.map(({ label, items }) => (
                <div className="task-section" key={label}>
                  {(() => {
                    const sectionKey = `tasks:${label}`;
                    const isHeaderless = ["更多任务", "任务"].includes(label);
                    const isCollapsed = isHeaderless
                      ? false
                      : collapsedSections[sectionKey] ?? label === "已完成";
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
                      <span className="text-xs text-gray-400">
                        {items.length}
                      </span>
                      {activeNav.startsWith("list:") && label !== "已完成" && (
                        <Plus className="ml-auto h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  )}
                  {!isCollapsed && items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      showCreatedDate={activeNav === "upcoming" || activeNav === "inbox"}
                      selected={task.id === selectedId}
                      onSelect={() => setSelectedId(task.id)}
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
          {isTaskView && showDetail && (
            <aside className="task-detail">
              <div className="task-detail-toolbar">
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
                            ? { ...task, date: value?.format("YYYY-MM-DD") || "" }
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
                              ? { ...task, priority: { high: "高", medium: "中", low: "低", none: "" }[key] }
                              : task,
                          ),
                        ),
                    }}
                  >
                    <Button variant="ghost" size="icon" className="task-detail-flag" aria-label="设置优先级">
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
                    <Input
                      className="h-9 border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
                      value={selected.title}
                      onChange={(e) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? { ...task, title: e.target.value }
                              : task,
                          ),
                        )
                      }
                    />
                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-500">
                      <CalendarDays className="h-4 w-4" />
                      {selected.time || "今天"}
                    </div>
                  </div>
                  <ListTodo className="task-detail-list-icon" aria-label="清单" />
                </div>
                <Input.TextArea
                  className={`task-detail-notes ${selected.title === "✨ 更多特色功能" ? "is-rich-source" : ""}`}
                  variant="borderless"
                  value={selected.detail || ""}
                  placeholder="添加备注..."
                  autoSize={{ minRows: 3 }}
                  onChange={(e) =>
                    setTasks((current) =>
                      current.map((task) =>
                        task.id === selected.id
                          ? { ...task, detail: e.target.value }
                          : task,
                      ),
                    )
                  }
                />
                {selected.title === "✨ 更多特色功能" && (
                  <div className="task-rich-description" aria-label="任务说明">
                    <p>我们还有这些特色功能：</p>
                    <p><strong>全平台支持：</strong> 不管是手机、电脑，还是手表，几乎所有用得到的设备和操作系统都支持。<a role="button" tabIndex={0} onClick={() => handleRichLink("platform")}>👀 看看支持哪些平台</a></p>
                    <p><strong>共享协作：</strong> 项目需要和同事一起完成？快邀请他们加入你的清单，轻松指派任务给成员。<a role="button" tabIndex={0} onClick={() => handleRichLink("share")}>🤝 如何共享清单</a></p>
                    <p><strong>标签：</strong> 想要个性化管理任务？试试给任务添加标签，轻松分类和筛选任务，管理更便捷。<a role="button" tabIndex={0} onClick={() => handleRichLink("tag")}>🏷️ 如何使用标签</a></p>
                    <p><strong>过滤器：</strong> 需要查看所有高优先级的任务？试试过滤器功能，随心所欲筛选你想看的任务。<a role="button" tabIndex={0} onClick={() => handleRichLink("filter")}>🚀 如何使用过滤器</a></p>
                    <p><strong>摘要：</strong> 还在为复盘内容苦思冥想？试试摘要功能，轻松掌握一段时间内的任务完成情况。<a role="button" tabIndex={0} onClick={() => handleRichLink("summary")}>📋 如何使用摘要</a></p>
                    <p><strong>指令菜单：</strong> 想快速前往功能模块，直接使用指令菜单（Ctrl/Command+K），轻松前往。<a role="button" tabIndex={0} onClick={() => handleRichLink("shortcut")}>⌨️ 了解更多快捷操作</a></p>
                  </div>
                )}
                <div className="task-detail-composer" aria-label="添加备注">
                  <Plus className="h-4 w-4" />
                  <Input
                    variant="borderless"
                    placeholder="添加备注..."
                    value={selected.title === "✨ 更多特色功能" ? "" : selected.detail || ""}
                    onChange={(e) =>
                      setTasks((current) =>
                        current.map((task) =>
                          task.id === selected.id ? { ...task, detail: e.target.value } : task,
                        ),
                      )
                    }
                  />
                </div>
                <div className="mt-8 space-y-1 text-sm">
                  <DetailRow icon={Tag} label="清单" value={selected.list} />
                  <DetailRow
                    icon={Star}
                    label="优先级"
                    value={selected.priority}
                  />
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500">日期</span>
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
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500">提醒</span>
                    <Input
                      type="text"
                      placeholder="如：今天 18:00"
                      className="ml-auto h-8 w-32 text-right text-xs"
                      value={selected.reminder || ""}
                      onChange={(e) =>
                        setTasks((current) =>
                          current.map((task) =>
                            task.id === selected.id
                              ? { ...task, reminder: e.target.value }
                              : task,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <Timer className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500">重复</span>
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
                              ? { ...task, repeat: value }
                              : task,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="mt-5">
                  <div className="mb-2 text-xs text-gray-500">标签</div>
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
                    <div className="mb-2 text-sm font-medium text-gray-700">
                      子任务
                    </div>
                    {(selected.subtasks || []).map((item, index) => (
                      <button
                        key={item}
                        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-gray-600 hover:text-gray-900"
                        onClick={() =>
                          setTasks((current) =>
                            current.map((task) =>
                              task.id === selected.id
                                ? {
                                    ...task,
                                    subtasks: (task.subtasks || []).filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  }
                                : task,
                            ),
                          )
                        }
                      >
                        <span className="task-check h-4 w-4" />
                        {item}
                      </button>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-gray-400" />
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
                                        value,
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
                    items: lists.map(([label]) => ({ key: label, label })),
                    onClick: ({ key }) =>
                      setTasks((current) =>
                        current.map((task) =>
                          task.id === selected.id
                            ? {
                                ...task,
                                list: key,
                                ...(Array.isArray(task.lists)
                                  ? { lists: [key] }
                                  : Array.isArray(task.categories)
                                    ? { categories: [key] }
                                    : {}),
                              }
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
                    className={formatToolbarOpen ? "is-active" : ""}
                    onClick={() => setFormatToolbarOpen((value) => !value)}
                    aria-label="文本格式"
                  >
                    <TextFormat className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="评论"
                    title="添加评论"
                    onClick={() => document.querySelector('[aria-label="添加备注"] input')?.focus()}
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
                          : { key: "delete", label: "移入垃圾桶", danger: true },
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
              {formatToolbarOpen && (
                <div className="task-format-toolbar">
                  <TextFormat className="h-5 w-5" />
                  <strong>H</strong><strong>B</strong><span>🖍</span>
                  <span>☑</span><span>☷</span><span>1.</span><em>I</em><MoreHorizontal className="h-5 w-5" />
                </div>
              )}
            </aside>
          )}
        </div>
        {activeTool && (
          <ToolOverlay
            mode={activeTool}
            tasks={tasks.filter((task) => !task.deleted)}
            baseDate={calendarSelectedDay}
            onClose={() => setActiveTool(null)}
            onCreate={() => {
              setActiveTool(null);
              requestAnimationFrame(() => document.getElementById("task-input")?.focus());
            }}
            onMove={moveTask}
            onSelect={(id) => {
              setSelectedId(id);
              setShowDetail(true);
              setActiveTool(null);
            }}
          />
        )}
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
          <p className="text-sm text-gray-500">
            {confirmAction?.type === "delete-list"
              ? "清单中的任务将移入收件箱。"
              : "你可以在垃圾桶中恢复此任务。"}
          </p>
        </Modal>
        <Modal
          open={searchOpen}
          title="搜索任务、项目或标签"
          footer={null}
          onCancel={() => setSearchOpen(false)}
          destroyOnHidden
        >
          <Input
            autoFocus
            allowClear
            prefix={<Search className="h-4 w-4 text-gray-400" />}
            placeholder="输入关键词搜索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-4 max-h-64 overflow-y-auto">
            {search.trim() && visibleTasks.length === 0 && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的任务" />
            )}
            {search.trim() &&
              visibleTasks.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  className="task-search-result"
                  onClick={() => {
                    setSelectedId(task.id);
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
    </ConfigProvider>
  );
}
function ToolOverlay({ mode, tasks, baseDate, onClose, onCreate, onSelect, onMove }) {
  const [calendarView, setCalendarView] = useState("月");
  const [displayMonth, setDisplayMonth] = useState(() => {
    const date = new Date(`${baseDate}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const tomorrow = shiftDate(baseDate, 1);
  const title = {
    calendar: "多视图日历",
    kanban: "看板",
    timeline: "时间线",
    matrix: "四象限",
  }[mode];
  const groups =
    mode === "matrix"
      ? [
          ["重要且紧急", tasks.filter((t) => t.priority === "高")],
          ["重要不紧急", tasks.filter((t) => t.priority === "中")],
          ["不重要但紧急", tasks.filter((t) => t.priority === "低")],
          [
            "其他",
            tasks.filter((t) => !["高", "中", "低"].includes(t.priority)),
          ],
        ]
      : mode === "kanban"
        ? [
            [
              "待处理",
              tasks.filter((t) => !t.done && t.status !== "in-progress"),
            ],
            [
              "进行中",
              tasks.filter((t) => !t.done && t.status === "in-progress"),
            ],
            ["已完成", tasks.filter((t) => t.done)],
          ]
        : [
            ["今天", tasks.filter((t) => !t.date || t.date === baseDate)],
            ["明天", tasks.filter((t) => t.date === tomorrow)],
            [
              "以后",
              tasks.filter((t) => ![baseDate, tomorrow].includes(t.date)),
            ],
          ];
  const renderTask = (task) => (
    <button
      draggable
      className="tool-task w-full text-left"
      key={task.id}
      title={task.title}
      aria-label={`打开任务：${task.title}`}
      onDragStart={(event) =>
        event.dataTransfer.setData("task-id", String(task.id))
      }
      onClick={() => onSelect(task.id)}
    >
      <TaskCategories task={task} />
      {task.title}
    </button>
  );
  const renderCalendar = () => {
    if (calendarView === "月") {
      const year = displayMonth.getFullYear();
      const month = displayMonth.getMonth();
      const offset = new Date(year, month, 1).getDay();
      const total =
        Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
      const days = Array.from({ length: total }, (_, i) => i - offset + 1);
      return (
        <div className="tool-month-grid">
          {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
            <div className="tool-month-weekday" key={`weekday-${day}`}>
              {day}
            </div>
          ))}
          {days.map((day) => {
            const dateObj = new Date(year, month, day);
            const date = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
            const dayTasks = tasks.filter(
              (task) => task.date === date || (!task.date && date === baseDate),
            );
            return (
              <div
                className={`tool-month-day ${dateObj.getMonth() !== month ? "is-outside" : ""}`}
                key={date}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = Number(event.dataTransfer.getData("task-id"));
                  if (id) onMove(id, `date:${date}`);
                }}
              >
                <div className="tool-month-number">{dateObj.getDate()}</div>
                {dayTasks.map(renderTask)}
              </div>
            );
          })}
        </div>
      );
    }
    const count = calendarView === "日" ? 1 : 7;
    const startDate = calendarView === "日" ? baseDate : getWeekStart(baseDate);
    return (
      <div className={`tool-calendar-grid view-${calendarView}`}>
        {Array.from({ length: count }, (_, i) =>
          (() => {
            const date = shiftDate(startDate, i);
            const dateObject = new Date(`${date}T12:00:00`);
            const weekday = dateObject.toLocaleDateString("zh-CN", {
              weekday: "short",
            });
            return (
              <div
                className="tool-day"
                key={date}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = Number(event.dataTransfer.getData("task-id"));
                  if (id) onMove(id, `date:${date}`);
                }}
              >
                <div className="tool-day-title">
                  {calendarView === "日"
                    ? "今天"
                    : `${weekday} ${date.slice(5).replace("-", "/")}`}
                </div>
                {tasks
                  .filter(
                    (task) =>
                      task.date === date || (!task.date && date === baseDate),
                  )
                  .map(renderTask)}
              </div>
            );
          })(),
        )}
      </div>
    );
  };
  const monthTitle = `${displayMonth.getFullYear()}年${displayMonth.getMonth() + 1}月`;
  return (
    <div className="tool-overlay">
      <div className="tool-window">
        <div className="tool-window-head">
          <div className="flex items-center gap-4">
            <h2>{mode === "calendar" ? monthTitle : title}</h2>
            {mode === "calendar" && (
              <div className="calendar-top-controls">
                <Button variant="outline" size="icon" title="新建任务" onClick={onCreate}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Select
                  value={calendarView}
                  onChange={setCalendarView}
                  className="calendar-view-select"
                  options={["日", "周", "月", "议程"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
                <div className="calendar-nav">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDisplayMonth(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const date = new Date(`${baseDate}T12:00:00`);
                      setDisplayMonth(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                    }}
                  >
                    今天
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDisplayMonth(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "today", label: "回到今天" },
                      { key: "close", label: "关闭日历" },
                    ],
                    onClick: ({ key }) => {
                      if (key === "today") {
                        const date = new Date(`${baseDate}T12:00:00`);
                        setDisplayMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                      } else if (key === "close") {
                        onClose();
                      }
                    },
                  }}
                >
                  <Button variant="ghost" size="icon" title="更多日历选项" aria-label="更多日历选项">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </Dropdown>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
        {mode === "calendar" ? (
          renderCalendar()
        ) : (
          <div className="tool-columns">
            {groups.map(([label, items]) => (
              <div
                className="tool-column"
                key={label}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = Number(event.dataTransfer.getData("task-id"));
                  if (id) onMove(id, label);
                }}
              >
                <h3>
                  {label}
                  <span>{items.length}</span>
                </h3>
                {items.map(renderTask)}
              </div>
            ))}
          </div>
        )}
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
      <span className="min-w-0 flex-1 truncate text-left">{task.title}</span>
      {task.time && <span className="text-xs text-blue-500">{task.time}</span>}
      {showCreatedDate && getTaskCreatedDate(task) && (
        <span className="task-created-date">{getTaskCreatedDate(task)}</span>
      )}
      <TaskCategories task={task} />
    </div>
  );
}
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-gray-500">{label}</span>
      <span className="ml-auto text-gray-800">{value}</span>
    </div>
  );
}
export default WelcomePage;
