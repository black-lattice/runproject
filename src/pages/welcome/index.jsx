import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button as AntButton,
  Calendar,
  Card,
  Checkbox,
  ConfigProvider,
  Dropdown,
  Empty,
  Input,
  Menu,
  Modal,
  Segmented,
  Select,
  Tag as AntTag,
  theme as antdTheme,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import {
  AppstoreOutlined as Grid2X2,
  BellOutlined as Bell,
  CalendarOutlined as CalendarDays,
  CheckOutlined as Check,
  CheckSquareOutlined as CheckSquare2,
  ClockCircleOutlined as Timer,
  CodeOutlined as Code2,
  DeleteOutlined as Trash2,
  DownOutlined as ChevronDown,
  InboxOutlined as Inbox,
  MenuFoldOutlined as PanelLeft,
  MoreOutlined as MoreHorizontal,
  PlusOutlined as Plus,
  ProjectOutlined as CircleDot,
  QuestionCircleOutlined as HelpCircle,
  RightOutlined as ChevronRight,
  SearchOutlined as Search,
  StarOutlined as Star,
  SyncOutlined as RefreshCw,
  TagOutlined as Tag,
  UnorderedListOutlined as ListTodo,
  UserOutlined as UserRound,
} from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { PAGE_CONFIGS } from "@/config/routes";

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
  {
    id: 1,
    date: "2026-09-06",
    title: "检查 RunProject 首页布局",
    time: "09:00",
    list: "产品开发",
    priority: "高",
    done: false,
    tags: ["首页", "优化"],
    reminder: "今天 08:45",
    repeat: "",
    subtasks: ["检查三栏布局", "确认按钮交互"],
    detail: "对照滴答清单的三栏结构，确认任务流、导航和右侧详情都清晰。",
  },
  {
    id: 2,
    date: "2026-09-06",
    title: "整理项目启动脚本",
    time: "11:00",
    list: "产品开发",
    priority: "中",
    done: false,
    tags: ["开发"],
    reminder: "",
    repeat: "每周一",
    subtasks: [],
    detail: "统一 npm、pnpm 和 yarn 的启动命令。",
  },
  {
    id: 3,
    date: "2026-09-06",
    title: "回顾本周需求",
    time: "14:00",
    list: "认真工作",
    priority: "低",
    done: false,
    tags: ["复盘"],
    reminder: "",
    repeat: "",
    subtasks: [],
    detail: "整理完成事项，确定下周优先级。",
  },
  {
    id: 4,
    date: "2026-09-06",
    title: "提交首页视觉优化",
    time: "",
    list: "收件箱",
    priority: "中",
    done: false,
    tags: ["开发"],
    reminder: "",
    repeat: "每周一",
    subtasks: [],
    detail: "提交代码并记录设计决策。",
  },
  {
    id: 5,
    date: "2026-09-07",
    title: "准备周会材料",
    time: "明天",
    list: "认真工作",
    priority: "低",
    done: false,
    tags: ["复盘"],
    reminder: "",
    repeat: "",
    subtasks: [],
    detail: "汇总项目进度和风险。",
  },
];

const INITIAL_DAY = "2026-09-06";

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

  const timeMatch = title.match(
    /(上午|下午)?\s*(\d{1,2})(?:[:：点](\d{1,2}))?/,
  );
  let time = "";
  if (timeMatch) {
    let hour = Number(timeMatch[2]);
    const minute = timeMatch[3] ? Number(timeMatch[3]) : 0;
    if (timeMatch[1] === "下午" && hour < 12) hour += 12;
    if (timeMatch[1] === "上午" && hour === 12) hour = 0;
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    title = title.replace(timeMatch[0], "");
  }

  return { date, time, title: title.replace(/^[，,：:\s]+|[，,：:\s]+$/g, "") };
}

function WelcomePage() {
  const navigate = useNavigate();
  const { addTab } = useAppStore();
  const [tasks, setTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("runproject-tasks")) || seedTasks;
    } catch {
      return seedTasks;
    }
  });
  const [selectedId, setSelectedId] = useState(1);
  const [input, setInput] = useState("");
  const [activeNav, setActiveNav] = useState("today");
  const [search, setSearch] = useState("");
  const [showDetail, setShowDetail] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [activeTool, setActiveTool] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(INITIAL_DAY);
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [listEditor, setListEditor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [lists, setLists] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("runproject-lists")) || [
          ["产品开发", "13"],
          ["认真工作", "44"],
          ["生活备忘", "7"],
          ["用心生活", "10"],
          ["锻炼计划", "10"],
        ]
      );
    } catch {
      return [
        ["产品开发", "13"],
        ["认真工作", "44"],
        ["生活备忘", "7"],
        ["用心生活", "10"],
        ["锻炼计划", "10"],
      ];
    }
  });
  const isTaskView = activeTool === null;
  const tomorrowDate = shiftDate(calendarSelectedDay, 1);
  const upcomingEndDate = shiftDate(calendarSelectedDay, 6);
  useEffect(() => {
    localStorage.setItem("runproject-tasks", JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem("runproject-lists", JSON.stringify(lists));
  }, [lists]);
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
        document.querySelector(".task-inline-search input")?.focus();
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
        (task) => !task.date || task.date === calendarSelectedDay,
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
      list = list.filter((task) => task.list === "收件箱");
    } else if (activeNav.startsWith("list:")) {
      list = list.filter((task) => task.list === activeNav.slice(5));
    }

    if (priorityFilter !== "全部") {
      list = list.filter((task) => task.priority === priorityFilter);
    }
    if (!query) return list;
    return list.filter((task) =>
      `${task.title} ${task.list} ${task.detail} ${(task.tags || []).join(" ")}`
        .toLowerCase()
        .includes(query),
    );
  }, [
    activeNav,
    calendarSelectedDay,
    priorityFilter,
    search,
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
    const parsed = parseTaskInput(title, calendarSelectedDay);
    const task = {
      id: Date.now(),
      date: parsed.date,
      title: parsed.title || "未命名任务",
      time: parsed.time,
      list: activeNav.startsWith("list:") ? activeNav.slice(5) : "收件箱",
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
  const navItems = [
    ["all", "所有", ListTodo, String(activeTasks.length)],
    [
      "today",
      "今天",
      CalendarDays,
      String(
        activeTasks.filter(
          (t) => !t.done && (!t.date || t.date === calendarSelectedDay),
        ).length,
      ),
    ],
    [
      "tomorrow",
      "明天",
      CalendarDays,
      String(
        activeTasks.filter((t) => !t.done && t.date === tomorrowDate).length,
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
      String(activeTasks.filter((t) => !t.done && t.list === "收件箱").length),
    ],
    ["summary", "摘要", ListTodo, ""],
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
          task.list === previousLabel ? { ...task, list: nextLabel } : task,
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
          task.list === label ? { ...task, list: "收件箱" } : task,
        ),
      );
      if (activeNav === `list:${label}`) setActiveNav("today");
    }
    if (confirmAction?.type === "delete-task") {
      setTasks((current) =>
        current.filter((task) => task.id !== confirmAction.id),
      );
      setSelectedId(null);
    }
    setConfirmAction(null);
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
            <Button
              variant="ghost"
              size="icon"
              className="task-rail-logo"
              title="账户"
            >
              <UserRound className="h-5 w-5" />
            </Button>
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
                window.requestAnimationFrame(() =>
                  document.querySelector(".task-inline-search input")?.focus(),
                );
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
              <div className="mb-2 flex items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <span>我的清单</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="新建清单"
                  onClick={() =>
                    setListEditor({ previousLabel: "", value: "" })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
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
                          (task) => !task.done && task.list === label,
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
                          {tasks.filter((task) => task.done).length}
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
                  <p className="text-xs font-medium text-blue-500">
                    {formatDateLabel(calendarSelectedDay)}
                  </p>
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
                      {visibleTasks.filter((t) => !t.done).length}
                    </span>
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="task-inline-search"
                    aria-label="搜索任务、项目或标签"
                    prefix={<Search className="h-4 w-4 text-gray-400" />}
                    placeholder="搜索任务、项目或标签"
                    allowClear
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="切换详情面板"
                    onClick={() => setShowDetail((value) => !value)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                  <Segmented
                    size="small"
                    aria-label="优先级筛选"
                    options={["全部", "高", "中", "低"]}
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                  />
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
                  placeholder="添加任务，试试输入“明天下午3点开会”"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={() => addTask()}
                />
                <Button type="primary" size="small" onClick={() => addTask()}>
                  添加
                </Button>
              </div>
              <div className="task-section">
                <div className="task-section-title">
                  <ChevronDown className="h-4 w-4" />
                  <span>
                    {activeNav === "today"
                      ? "今天"
                      : activeNav === "tomorrow"
                        ? "明天"
                        : "任务"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {visibleTasks.filter((t) => !t.done).length}
                  </span>
                </div>
                {visibleTasks.length === 0 && (
                  <Empty
                    className="task-empty"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="这里还没有任务，按 N 快速添加"
                  />
                )}
                {visibleTasks.slice(0, 4).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
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
              </div>
              <div className="task-section">
                <div className="task-section-title">
                  <ChevronDown className="h-4 w-4" />
                  <span>{activeNav === "today" ? "接下来" : "更多任务"}</span>
                  <span className="text-xs text-gray-400">
                    {Math.max(0, visibleTasks.length - 4)}
                  </span>
                </div>
                {visibleTasks.slice(4).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
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
              </div>
            </main>
          )}
          {isTaskView && showDetail && (
            <aside className="task-detail">
              <div className="task-detail-toolbar">
                <span className="text-sm text-gray-500">任务详情</span>
                <div className="flex items-center gap-2">
                  {selected.deleted && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setTasks((current) =>
                            current.map((task) =>
                              task.id === selected.id
                                ? { ...task, deleted: false }
                                : task,
                            ),
                          )
                        }
                      >
                        恢复
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() =>
                          setConfirmAction({
                            type: "delete-task",
                            id: selected.id,
                          })
                        }
                      >
                        永久删除
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => {
                      setTasks((current) =>
                        current.map((task) =>
                          task.id === selected.id
                            ? { ...task, deleted: true }
                            : task,
                        ),
                      );
                      setSelectedId(
                        tasks.find(
                          (task) => task.id !== selected.id && !task.deleted,
                        )?.id || null,
                      );
                    }}
                  >
                    删除
                  </Button>
                  <MoreHorizontal className="h-4 w-4 text-gray-400" />
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
                </div>
                <Input.TextArea
                  className="mt-7 min-h-24 w-full resize-y rounded-lg border border-transparent bg-transparent p-2 text-sm leading-6 text-gray-600 outline-none hover:border-gray-200 focus:border-blue-300 focus:bg-white"
                  value={selected.detail || ""}
                  placeholder="添加备注..."
                  autoSize={{ minRows: 4, maxRows: 10 }}
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
            </aside>
          )}
        </div>
        {activeTool && (
          <ToolOverlay
            mode={activeTool}
            tasks={tasks.filter((task) => !task.deleted)}
            baseDate={calendarSelectedDay}
            onClose={() => setActiveTool(null)}
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
              : "永久删除此任务？"
          }
          okText={confirmAction?.type === "delete-list" ? "删除" : "永久删除"}
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onOk={executeConfirmedAction}
          onCancel={() => setConfirmAction(null)}
          destroyOnHidden
        >
          <p className="text-sm text-gray-500">
            {confirmAction?.type === "delete-list"
              ? "清单中的任务将移入收件箱。"
              : "该操作无法撤销。"}
          </p>
        </Modal>
      </div>
    </ConfigProvider>
  );
}
function ToolOverlay({ mode, tasks, baseDate, onClose, onSelect, onMove }) {
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
      <span className={`task-priority p-${task.priority}`}>
        {task.priority}
      </span>
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
                <Button variant="outline" size="icon" title="新建任务">
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
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
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

function TaskRow({ task, selected, onSelect, onToggle, onPriority }) {
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
      <span
        className={`task-priority p-${task.priority} cursor-pointer`}
        title="点击切换优先级"
        onClick={(e) => {
          e.stopPropagation();
          onPriority();
        }}
      >
        {task.priority}
      </span>
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
