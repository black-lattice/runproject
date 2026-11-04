# 项目总管

总管是 RunProject 桌面应用中的统一需求入口。它有独立的模型后端和会话记录，对需求进行路由，按项目创建 Codex Worker，并在 Worker 完成后自动汇报。

## 开始使用

1. 在运行 RunProject 的机器安装 Codex CLI，并在终端执行 `codex login`。
2. 打开应用顶部的 **总管 → 连接设置**。留空自动检测 `codex`，或选择本机 Codex 可执行文件。应用会启动自己的 `codex app-server` 子进程，通过 stdio 通信，不需要手工启动服务或开放端口。
3. 项目列表沿用 **项目管理** 中保存的项目和工作区。也可以在总管右侧点击 **添加**，登记任意项目目录，包括没有 `package.json` 的项目。
4. 输入项目名称、目标和约束。总管可以一次分派多个项目；项目不明确时会先询问。
5. 通过右侧任务卡片查看执行记录和最新回复。点击 **继续追问**，可以明确把补充要求交给同一个 Worker。

项目管理默认导入工作区的直属文件夹，保留实际目录名，包括 Swift、Rust 和普通目录。更新扫描规则后刷新对应工作区，总管即可识别新增项目。一个需求涉及多个独立项目时，总管默认分别创建 Worker 并行执行，无需用户描述分派步骤；缺失的项目会单独询问，其它项目继续执行。

Worker 使用该机器的 CLI 默认模型和已有登录状态。总管默认沿用 CLI，也可以单独选择模型、推理强度，或接入第三方 API。模型调用仍通过配置的模型服务完成；使用本地 app-server 不表示模型离线运行。

## 总管模型设置

点击页面顶部的模型按钮打开 **总管 Agent 设置**。配置只影响总管，Worker 保持原有 Codex 设置。

### 本机 Codex

- 点击 **读取本机模型** 获取当前 CLI 返回的模型列表和支持的推理强度，也可手动输入模型 ID。
- 模型和推理强度留空时沿用 CLI 配置；选择列表中的模型时默认选中其建议推理强度。
- 自定义模型 ID 必须能由本机 Codex 所配置的模型服务处理。

### OpenAI 兼容 API

- 填写 API 基础地址（例如 `https://host/v1`）、API Key 和模型 ID；也可填写完整的 `/chat/completions` 地址。
- **读取模型列表**调用服务的 `/models`，接口未提供该能力时可手动填写 ID。
- 推理强度默认不发送参数。选择后通过 `reasoning_effort` 传递，具体取值由服务商和模型决定。
- 结构化输出支持 JSON 模式、严格 JSON Schema，以及不发送 `response_format` 的提示词兼容模式。总管只执行通过本地解析和项目目录校验的任务计划；格式错误不派发任务。
- **测试模型连接**使用不含真实对话和项目内容的测试请求，验证模型能否返回总管计划。测试会调用所选模型，但不会执行任何项目工作。
- API Key 保存在 macOS 钥匙串、Windows Credential Manager 或 Linux Secret Service；普通数据库只保存凭据引用。凭据库不可用时会明确报错，不回退到明文存储。
- 密钥绑定到准确的 API 端点；改变地址后不会将旧密钥发到新地址。远程接口要求 HTTPS，本机服务允许 HTTP。HTTP 重定向不会自动跟随。
- 请求会发送用户需求、项目名称与路径、近期对话和 Worker 结果到配置的 API。当前支持 OpenAI 兼容 Chat Completions，不直接支持 Anthropic Messages 等其他原生协议。

保存模型配置后从下一轮处理生效，不会中断 Worker。切换模型后重新建立总管会话，继续携带近期对话与任务账本；完整聊天记录保留在本地。第三方模式下普通问答不需要启动 Codex，派发项目任务仍需要本机 Codex 可用。

## 会话与执行

- Codex 总管和每项 Worker 任务各自保存 thread ID；API 总管保存有界的请求/回复历史。已完成 Worker 的追问通过 `thread/resume` 续接；运行中的补充通过 `turn/steer` 追加。
- 不同目录最多同时运行三个 Worker。同一目录及互相包含的父子目录排队执行，避免并发修改同一份文件。
- Worker 使用 `workspace-write` 和 `on-request`。命令执行或文件修改需要额外审批时，总管页显示具体请求，可允许本次或拒绝。
- Worker 的成功状态以 `turn/completed` 中的 `completed` 为准；失败或中断不会标记为成功。最终汇报由总管根据 Worker 输出整理，仍需关注它提供的验证证据。
- **停止**会请求中断当前轮次，或取消排队任务。中断不会撤销已经产生的文件修改。
- 任务账本、对话和会话 ID 存放在 RunProject 应用数据目录的 SQLite 数据库中。重启时未完成的任务标记为已中断，不自动重放；用户可继续原任务。
- 总管在 RunProject 桌面进程存活时自动跟进。完全退出应用会关闭它启动的 app-server；后台守护运行、跨机器连接不属于此版。

## 边界与排查

- 浏览器预览只展示页面；真实执行需要 Tauri 桌面后端。
- 未检测到 Codex：先确认终端可执行 `codex app-server --help`；也可填写可执行文件绝对路径。不会自动下载或升级 CLI。
- 未登录或额度错误：在对应机器的 CLI 中处理登录和账户状态，再重新连接。
- app-server 断开：界面保留失败原因和任务记录，重新连接后可继续对应任务。
- 暂未实现所有 Codex 交互类型。当前支持命令执行与文件修改审批；其他 server request 会明确返回不支持，并提示用户补充要求，不会静默等待。
- 不同版本的 CLI 协议可能有变化，RunProject 会显示服务端返回的具体错误。

## 开发验证

```sh
node --test tests/*.test.js
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
pnpm build
```

真实链路测试单独启用，会使用已有 CLI 登录并产生模型调用。项目数据完全位于临时目录，覆盖路由、只读 Worker 执行、自动汇报、第二轮恢复相同 Worker 和测试目录未修改：

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib \
  agent::tests::real_codex_routes_reports_and_resumes_worker -- --ignored --nocapture
```

可通过 `RUNPROJECT_REAL_CODEX` 指定测试所用的 Codex 可执行文件。测试不会改写真实项目，也不会要求配置额外 API key。
