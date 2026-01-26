# RunProject 迁移方案：将“UI + CLI（Codex）MCP 模式”集成到 Tauri

本文档基于本项目现有的 Tauri 架构（`src-tauri` + 前端 `src`），给出将“UI 与 CLI（如 Codex）通过 MCP/JSON-RPC 连接”的模式迁移进来的可落地方案。

---

## 1. 目标与原则

- **目标**：在 RunProject 内新增一个“AI CLI 会话/工作流”能力，使 UI 可视化地驱动 Codex CLI（或类似 MCP 协议 CLI），并展示事件流、文件变更、权限确认等。
- **原则**：
  - 不破坏现有终端/命令执行能力；
  - 复用项目现有的 invoke/listen 事件机制；
  - UI 与 CLI 通信统一走 Rust 侧管理（避免前端直接 spawn）。

---

## 2. 现有结构可以复用的部分

- **IPC 通道**：前端使用 `@tauri-apps/api/core` 的 `invoke` 和 `@tauri-apps/api/event` 的 `listen/emit`，已在终端模块中成熟运行（`src-tauri/src/modules/terminal/pty_manager.rs`）。
- **进程管理**：项目已有进程启动和命令执行封装（`src-tauri/src/modules/platform.rs`、`src-tauri/src/modules/kitty/*`），可复用思路。
- **事件分发**：`app.emit()` 已用于向前端推送终端输出，适合用于“Codex 事件流”。

---

## 3. 迁移后的模块设计（Rust 侧）

建议新增 `src-tauri/src/modules/codex/` 模块，包含：

1) **connection.rs**（核心）
- 负责 `spawn codex` 并接入 MCP 模式（`codex mcp-server` / `codex mcp serve`）
- 维护 JSON-RPC 请求/响应映射（id -> promise）
- 处理 stdout/stderr 的消息解析、错误分类和重试策略

2) **session.rs**
- 管理会话状态（connecting/connected/authenticated/session_active）
- 支持 `new_session` 与 `send_prompt` 两种入口

3) **event_handler.rs**
- 将 Codex 事件类型（消息、工具调用、权限请求、文件变更等）统一转成前端可消费的结构

4) **manager.rs**
- 作为 tauri command 的入口层（类似 `terminal::pty_manager`）
- 负责：
  - init/start/stop
  - send_message / approve_action / apply_patch
  - 与前端事件通道绑定

5) **types.rs**
- 定义 JSON-RPC、事件结构、错误类型

---

## 4. IPC 设计（前后端约定）

建议新增以下 Tauri commands（Rust -> JS 的调用入口）：

- `codex_start_session({ sessionId, workspace, cliPath? })`
- `codex_send_message({ sessionId, content, files? })`
- `codex_approve_action({ sessionId, callId, decision })`
- `codex_stop_session({ sessionId })`

建议新增事件通道（Rust emit -> 前端 listen）：

- `codex-event-{sessionId}`：JSON 结构的事件流
- `codex-status-{sessionId}`：连接状态更新
- `codex-file-change-{sessionId}`：文件变更预览/应用结果

这些事件可以复用当前 `terminal-output-{sessionId}` 的机制风格。

---

## 5. UI 侧集成方案

新增一个 “AI/CLI 会话”页或面板：

- **状态区**：连接状态、CLI 版本、认证状态
- **聊天区**：消息流（包括工具调用、文件变更、权限提示）
- **操作区**：发送消息、确认/拒绝、应用补丁等

代码层建议新增：

- `src/pages/codex/index.jsx`
- `src/store/useCodexStore.js`
- `src/services/codex.js`（封装 invoke/监听）

UI 的信息流基本是：

1) 用户点击“启动会话”
2) 前端 `invoke(codex_start_session)`
3) 后端 emit 连接与事件流
4) 前端 listen 渲染消息、工具调用、权限卡片
5) 用户确认/拒绝 -> `invoke(codex_approve_action)`

---

## 6. 文件变更与权限模型

Codex CLI 可能触发：
- 命令执行
- 文件 patch/apply
- MCP 工具调用

建议规则：

- **执行命令**：必须 UI 确认，未确认不落地
- **apply_patch**：展示 diff，确认后执行
- **文件写入**：默认只允许 workspace 目录（与现有 workspace 概念对齐）

这一层可通过：
- “sandbox 模式”标记（workspace-write / read-only / full）
- 统一校验函数（Rust side）

---

## 7. 与现有能力的整合点

- **终端页**：可复用 `xterm.js` 作为 Codex 输出的一个可视化视图，但建议保留消息流 UI。
- **项目工作区**：复用已有 workspace 选择器，让 Codex 以项目根目录执行。
- **命令执行**：可以允许 Codex 调用现有 `execute_project_command`（统一走 Rust 层校验）。

---

## 8. 分阶段落地计划

### 阶段 1：最小闭环
- Rust 实现 `codex_start_session` + `codex_send_message`
- 前端新页面显示文本消息流（无需工具调用/补丁）

### 阶段 2：权限与工具调用
- 实现 `codex_approve_action`
- UI 中展示权限卡片与确认按钮

### 阶段 3：文件变更与补丁应用
- 展示 diff
- 支持应用/拒绝

### 阶段 4：细节优化
- 断线重连
- 多会话管理
- 统一错误提示与诊断面板

---

## 9. 风险与注意事项

- **CLI 版本兼容**：Codex CLI 不同版本 MCP 启动参数不同（需要自动探测）
- **稳定性**：CLI 输出非 JSON 会干扰协议，需要 robust parser
- **权限安全**：必须限制文件写入路径、防止越界
- **Windows 兼容**：进程启动、stdin/stdout 处理需专门验证

---

## 10. 下一步建议

1) 先实现 Rust 侧 `CodexConnection` 的最小 PoC（spawn + JSON-RPC 通信）
2) 前端加一个简单的会话页面用于事件展示
3) 再逐步引入权限与文件操作流程

---

如需我进一步生成 Rust 端的模块骨架代码（`connection.rs`, `manager.rs`, `types.rs`）或前端页面模板，请告诉我具体希望落地的阶段。
