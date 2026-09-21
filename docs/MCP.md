# RunProject MCP

RunProject 桌面应用启动时，内置 MCP 服务自动监听 `http://127.0.0.1:1421/mcp`。切换页面或隐藏到托盘后仍可使用，完全退出应用即停止。`npm run dev` 仅启动网页；开发时用 `npm run td` 启动包含 Rust 后端的桌面应用。

任务页左侧底部的 **MCP 服务** 入口，以及 **设置 → MCP 服务**，可查看实际运行状态、错误和连接配置。端口被占用时应用仍可正常使用，设置页会显示原因；关闭占用该端口的旧实例后重新启动应用。

## 连接 Codex

在设置中点击“复制配置”，添加到 `~/.codex/config.toml`。不要覆盖已有的其他配置；已有 `runproject` 条目时更新该条目，避免重复定义。

```toml
[mcp_servers.runproject]
url = "http://localhost:1421/mcp"
http_headers = { Authorization = "Bearer <从应用复制的令牌>" }
```

保存后在 Codex 中重新连接 MCP 或启动新会话。桌面应用的安装更新需要重新启动新的应用二进制；只刷新网页不会更新 Rust 服务。

也可以使用环境变量提供令牌：

```toml
[mcp_servers.runproject]
url = "http://localhost:1421/mcp"
bearer_token_env_var = "RUNPROJECT_MCP_TOKEN"
```

环境变量需要对启动 Codex 的进程可见。配置字段参见 [OpenAI 官方 MCP 文档](https://developers.openai.com/codex/mcp)。本项目不会自动修改用户的 Codex 配置。

其他客户端选择 **Streamable HTTP**，配置相同 URL 和 `Authorization: Bearer …` 请求头。设置页提供常用 `mcpServers` JSON 示例，具体字段以客户端要求为准。仅支持 stdio 的客户端需要自行配置 HTTP 桥接器。

## Codex 受系统代理影响时

如果直接 HTTP 连接返回 502，但本地服务本身正常，可以使用项目提供的 `scripts/mcp-stdio.mjs`。它使用 Node 内置 HTTP 模块直接连接回环地址，不改变系统代理配置，也不直接读写业务数据库；RunProject 未运行时会提示先启动应用。

```toml
[mcp_servers.runproject]
command = "/Node.js 的绝对路径/node"
args = ["/桥接脚本的绝对路径/mcp-stdio.mjs"]

[mcp_servers.runproject.env]
RUNPROJECT_MCP_TOKEN = "从应用连接配置取得的令牌"
```

该配置替换同名 HTTP 条目，不能与其重复定义。`node -p 'process.execPath'` 可以查看 Node 可执行文件的实际路径。脚本可以复制到稳定目录（例如 `~/.codex/mcp/runproject/bridge.mjs`），使配置不依赖项目源码位置。重连 MCP 或开启新的 Codex 对话以加载配置。

## 工具

| 工具 | 用途 |
| --- | --- |
| `get_lists` | 所有清单、收件箱、任务计数 |
| `get_tasks` | 查询任务/问题，按清单、状态、关键词过滤；支持 offset 和 limit（1–200） |
| `get_task` | 根据 ID 读取完整任务，包括详情、子任务、回收站状态 |
| `create_task` | 创建任务，必须传 title；默认收件箱、待处理 |
| `update_task` | 修改 title/detail/list/date/time/priority/status/tags/section/repeat/reminder/important/urgent/pinned，未传字段保持不变 |
| `delete_task` / `restore_task` | 移入回收站 / 恢复 |
| `create_list` / `rename_list` / `delete_list` | 创建、重命名、删除清单；重命名同步任务引用，删除后保留其他清单归属，无其他归属时移至收件箱 |
| `get_workspaces` | 工作区路径、名称、项目数量和标签 |
| `get_projects` | 查询项目，读取路径、Node 版本、包管理器、scripts 和标签 |
| `add_workspace` / `refresh_workspace` | 扫描并添加 / 刷新工作区，传本机绝对目录路径 |
| `remove_workspace` | 从应用移除工作区，保留磁盘目录和文件 |
| `set_project_tags` | 替换工作区、项目或脚本的标签列表 |
| `start_project_script` | 传 project_path 和 script，启动 package.json 中已存在的脚本，立即返回执行记录 |
| `stop_project_script` | 传 run_id（启动结果的 id），停止脚本；force=true 立即强制停止 |
| `get_script_runs` | 查询执行记录，可按 project_path、running_only 过滤 |
| `get_script_run` | 传 run_id，读取状态、退出码及末尾日志；max_bytes 默认 16000，最大 262144 |

任务 ID 使用查询结果中的值，调用时转成字符串（同时兼容旧数字 ID 和新 UUID）。清单名称包含 emoji，需要完整匹配。状态取 `pending`、`in-progress`、`done`、`abandoned`；完成状态会同步 `done` 字段。优先级为 `高`、`中`、`低`、`无`。日期格式 `YYYY-MM-DD`，时间格式 `HH:mm`，传空字符串清除。

`create_task` 和 `update_task` 均支持 `repeat`、`reminder`、`important`、`urgent`、`pinned`。重复规则为 `每天`、`每周一`、`每周`、`每月`，空字符串取消。首次完成当前实例后生成唯一后续任务，响应的 `task.recurrenceNextId` 可用于读取；撤销后再次完成不会重复生成或覆盖已编辑的后续任务。月度规则在短月取最后一天，后续月份恢复原日期；错过的周期跳过，不批量补建历史任务。

`section` 会去除首尾空白，最多 40 个 UTF-16 字符，不能使用 `已完成`、`已放弃`、`未分组` 等系统名称，空字符串解除分组。明确设置时覆盖任务当前各清单中的分组；重命名和删除清单保留其他清单的分组。读取旧任务时，`status=abandoned` 优先，`status=done` 或 `done=true` 视为完成，任务过滤与清单未完成计数使用同一规则。

`reminder` 使用本机时间 `YYYY-MM-DDTHH:mm`，空字符串取消。提醒显示于应用内通知，需应用前端运行；应用完全退出后不会发送系统通知，重新打开时检查已到期提醒。三个布尔字段分别表示重要、紧急和置顶，重要与紧急独立控制四象限。MCP 对任务的修改会记录在任务动态中。

`set_project_tags` 的 target 为 `workspace`、`project` 或 `command`；path 为对应的绝对路径，脚本使用 `项目路径::脚本名`。脚本通过 npm/pnpm/yarn run 执行，使用项目已保存的 Node 版本偏好。执行前会验证项目属于已登记工作区、脚本存在于当前 package.json；脚本本身可能修改文件或启动服务。

示例对话：

- “读取 RunProject 的工作清单，列出还没完成的问题。”
- “把这个问题设为进行中，补充复现步骤；修复后标记完成。”
- “创建一个代码审查清单，添加三个待办。”
- “列出 RunProject 中的项目和它们的启动脚本。”
- “启动这个项目的 dev 脚本，查看启动日志。”
- “查看正在运行的脚本，停止刚才启动的 dev 服务。”
- “添加 `/绝对路径/工作区`，刷新项目列表，给这个项目加上‘重点’标签。”

## 存储与同步

MCP 与页面使用同一个应用数据目录中的 `runproject.db`，不创建第二份业务数据库。首次打开新版本桌面应用时会初始化两类数据；仅在数据库尚未初始化时迁移旧浏览器缓存。空清单和空任务数组会被保留，不重新填充欢迎数据。

写操作使用 SQLite 即时事务和忙等待。页面按实体及字段合并修改，不再用旧快照覆盖整个数据库；页面和客户端修改不同字段时均保留，同一字段采用最后提交的值，已移除实体不会被旧编辑复活。页面按顺序保存，写入期间的新编辑继续排队；服务事件通知页面，3 秒补充检查恢复遗漏事件。临时保存失败时保留页面中的修改并提示、重试；此时请保持应用打开直至同步成功。

服务支持 `localhost` 和 `127.0.0.1` 的 Host，仍只监听本机 IPv4。已有安装缺少任务排序字段时会自动迁移，保留记录。

每个安装生成并保存独立 Bearer 令牌，配置复制时包含完整令牌，界面默认隐藏。服务只绑定 IPv4 回环地址，验证 Host、Origin 和令牌，限制请求体大小，不向局域网开放。获取令牌的客户端拥有上述读写能力。协议实现使用官方 [Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)。

## 验证

```sh
node --test tests/*.test.js
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run build
```

Rust 测试使用临时数据库和临时端口，覆盖 HTTP 初始化、工具发现、鉴权、错误参数、清单任务增删改、分类引用、工作区扫描和并发写入，不操作用户现有数据。前端测试覆盖加载保护、并发修改合并、连续保存和失败重试。

## 脚本运行管理

MCP、项目页的内置终端和托盘共用执行管理器，脚本输出同步到终端页面。MCP 始终使用内置终端；外部 Kitty 会话不包含在这些执行记录中。同一项目的同一脚本运行中时，重复启动返回原来的记录。支持同时运行最多 16 个脚本。

`start_project_script` 返回的 `id` 是 `script-…` 字符串，将它作为查询和停止参数的 `run_id`。状态为 `running`、`stopping`、`succeeded`、`failed` 或 `stopped`；自然结束后记录真实退出码。停止请求通常先发送中断，1.2 秒后强制终止同组子进程；Windows 使用 taskkill 终止进程树。脚本主动脱离进程组创建的独立服务不属于该管理范围。

每个执行保留最后 2 MiB 输出，最多保留 50 条执行记录，均位于内存中；查询日志有截断标记，可能包含 ANSI 终端控制码。脚本结束后可继续查询日志，应用完全退出时停止托管脚本并清空历史。关闭主窗口到托盘不会停止脚本。

验证包含临时项目的 MCP 启动、并发重复启动、查询、停止及参数校验，以及实际退出码、日志容量限制和子进程终止测试。
