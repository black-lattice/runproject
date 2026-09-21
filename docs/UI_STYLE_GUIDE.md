# 界面样式规范

所有主页面（项目管理、终端、任务、设置）和任务工具视图共用同一套主题。

## 样式入口

- `src/styles/theme.css`：唯一的配色来源，以及页面、选中状态、文字层级和响应式外观。
- `src/styles/layout.css`：布局、滚动、交互和动效；不要再叠加独立的深色覆盖文件。
- `src/components/AppTheme.jsx`：读取 CSS 变量，同步 Ant Design 及其弹窗、下拉菜单，并跟随系统主题。
- `src/components/ui/`：公共按钮、卡片、输入框、选择器、弹窗。
- `src/components/PageHeading.jsx`：项目管理、设置、终端、格式化页面的标题、说明及操作区。
- `src/components/PageEmptyState.jsx`：项目与终端的统一空状态。

## 配色与层级

| 用途                 | Tailwind / CSS 变量                   |
| -------------------- | ------------------------------------- |
| 页面底色             | `bg-background` / `--background`      |
| 内容卡片、编辑区     | `bg-card` / `--card`                  |
| 侧栏和标题栏         | `--sidebar`                           |
| 轻量底色、悬停       | `bg-muted` / `--muted`                |
| 正文                 | `text-foreground`                     |
| 说明、路径、次要信息 | `text-muted-foreground`               |
| 主要操作、链接       | `text-primary` / `bg-primary`         |
| 选中状态             | `bg-accent text-primary`              |
| 成功 / 警告 / 错误   | `success` / `warning` / `destructive` |
| 边框 / 输入边框      | `border-border` / `border-input`      |

不要使用灰色、蓝色的固定色号替代这些角色。主按钮文字使用 `text-primary-foreground`，危险按钮文字使用 `text-destructive-foreground`，以兼容深浅色主题。终端输出与代码语法着色保留专业配色。

## 字体与间距

- 页面标题：22px / 600；详情标题：16px / 600。
- 正文和控件：14px / 400–500；说明、分类、计数：12px。
- 中文使用系统字体；代码、路径使用等宽字体。
- 常用间距：8、12、16、24px；页面内边距 24px，窄窗口 16px。
- 默认控件高度 36px，小控件 32px；圆角 8–12px。
- 普通卡片用细边框；阴影主要用于弹层。运行、完成、错误等状态保留语义提示。

## 页面检查

调整样式后运行 `npm run build`，并检查系统深浅色主题和窄窗口布局。检查任务列表与详情、日历、时间线、四象限、看板、项目空状态与命令卡片、设置及下拉框、终端空状态、格式化输入输出和错误状态。Tauri 命令执行需在桌面环境另行验证。
