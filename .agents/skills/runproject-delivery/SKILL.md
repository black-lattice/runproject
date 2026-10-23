---
name: runproject-delivery
description: "完成 RunProject 的问题定位、最小修复、验证、提交推送、版本发布，以及按需安装 macOS 新版本和刷新工作区。用户要求本项目交付、发布、本机更新，或明确复用完整修复发布流程时使用；单独排查问题不自动触发发布和安装。"
---

# RunProject 修复、发布与本机更新

## 按需求选择范围

- 仅修复：完成定位、最小修改和相关验证。
- 提交与发布：在修复基础上，完成版本同步、提交推送、CI 与 Release 附件验收。
- 本机更新：用户要求安装、重新打开或刷新工作区时，再执行本机更新部分；也可独立安装已发布版本。
- 沿用当前会话已有授权，不重复索要确认；技能被加载本身不扩大提交、发布、安装或停止脚本的授权。
- 默认本地项目已运行，不主动构建安装包。发布优先使用现有 GitHub Actions；只有明确需要本机构建时才执行。

用中文沟通，commit 使用中文。遵循最小修改原则，不顺便重构；文件超过 300 行时考虑拆分。下文代码路径相对于仓库根目录。

## 先确认当前事实

1. 检查 `git status -sb`、当前分支、`git remote -v`、最近提交和最新标签，保留已有修改。
2. 阅读项目指令、`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和 `.github/workflows/release.yml`。本项目实际是 React/JSX、Vite 与 Tauri/Rust，不按通用偏好改写成另一套技术栈。
3. Node 使用 nvm 管理；优先项目版本配置，其次参考 CI，使用已安装的兼容版本，不擅自替换系统 Node。
4. 从应用实际数据定位问题。可用时优先使用 RunProject MCP；连接方式见 [MCP 使用说明](../../../docs/MCP.md)。使用工具返回的精确名称、路径和 ID，不直接修改业务数据库或伪造缓存。

### 常用入口

| 问题 | 入口 |
| --- | --- |
| 侧边栏与项目行 | `src/components/Sidebar.jsx`、`src/components/ProjectItem.jsx` |
| 布局、滚动与弹层 | `src/styles/layout.css`、`src/components/ui/scroll-area.jsx`、`src/components/ui/popover.jsx` |
| 项目发现范围 | `src-tauri/src/modules/project_scanner.rs` |
| 工作区刷新与持久化 | `src/pages/project/index.jsx`、`src-tauri/src/mcp/tools.rs`、`src-tauri/src/storage.rs` |
| 发布平台、签名和附件命名 | `.github/workflows/release.yml` |
| 原生退出与托盘 | `src-tauri/src/lib.rs`、`src-tauri/src/modules/tray.rs` |

## 定位、修复与验证

- 侧边栏遮挡：测量 viewport、内容和按钮边界。检查 Radix ScrollArea 的内部 `display: table` 是否被长名称撑宽，以及 Grid/Flex 的最小宽度；把修复限定在侧边栏，给操作按钮留出位置，使长名称正常省略并可查看全文。
- 保留键盘聚焦、按钮的可访问名称、亮暗主题和滚动后弹层可操作性。不要只用 `overflow: hidden` 把按钮一起裁掉。
- 项目误识别：先用 `get_workspaces`、`get_projects` 查实际路径，再检查扫描器。`package.json` 不代表独立业务项目；第三方源码目录可能不叫 `node_modules`。
- 目前默认排除 `vendor`。涉及扫描范围的修改，应验证根目录与子项目中的依赖目录均被排除，同时保留正常嵌套项目，例如 `apps/web`。不要简单地“遇到项目就停止递归”，也不要按 `@deepseek-ai` 等名称前缀屏蔽项目。
- 扫描逻辑变更应有能复现问题的回归测试；必要时先确认原实现失败，再确认修复通过。样式微调不增加仅匹配实现细节的测试。

选择与改动相称的检查；完整发布可运行现有前后端测试：

```sh
node --test tests/*.test.js
cargo test --manifest-path src-tauri/Cargo.toml --release --lib --locked
git diff --check
```

`--release` 可复用本地 Rust 缓存，按实际缓存和耗时选择测试 profile。只检查修改文件的格式，不借机格式化无关代码。

UI 变更在可用浏览器工具中验证项目实际使用的宽度，例如 208、240、248px；覆盖长名称、长标签、列表末尾、按钮交互及键盘操作。尽量复用已运行服务，清理自己创建的临时页面与服务。测试夹具不得覆盖真实用户数据。

浏览器通过不能证明已安装的 Tauri 客户端更新。Rust 扫描器的修改需要重新构建并重启原生应用；刷新网页不会更新 Rust 二进制。

## 提交与发布

### 版本与提交

1. 查询远端最新标签、Release 和当前分支上游状态，按用户指定版本或本次变更确定新版本，不固定使用历史版本号。
2. 同步四处版本：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`，以及 `src-tauri/Cargo.lock` 中 `name = "runproject"` 对应项。不要替换其他依赖的同名版本字符串；标签为 `v` 加版本号。
3. 提交前核对完整 diff、文件列表和验证结果。用户要求“所有修改”时，检查全部工作区修改后纳入提交，不丢弃或暗中排除已有内容。
4. 使用中文 commit、带说明的版本标签。分支与标签一起推送可使用 `git push --atomic`，但分支、远端和标签必须来自本次检查，不能照抄历史值。新建分支时遵循项目分支约定。
5. 核对远端分支 SHA、标签指向的提交及本地工作区状态。带说明标签的对象 SHA 与提交 SHA 不同，应比较解引用后的提交。

若 `.github` 或 `.agents` 被全局隐藏目录规则忽略，先用 `git check-ignore -v` 定位。仅对本次需要的项目路径添加本地例外，或定点 `git add -f`；不要更改用户全局 Git 配置。`git add` 非零退出后先检查暂存区，它可能已经暂存了部分文件。

### CI 与 Release 验收

- 优先现有发布工作流。GitHub 连接器不支持所需 Release 操作时，使用已认证的 `gh`，不另建重复发布流程。
- 用新标签和本次提交 SHA 找到准确的 workflow run；检查版本校验及所有平台任务，不能把“标签已推送”“任务已触发”当作发布完成。
- 查询适当退避，等待期间保持简短进度沟通。`gh run watch` 的 EOF、网络断开不等于构建失败；重新查询同一个 run，不因此重复发布。
- 构建失败时先读取失败 job 日志，修复授权范围内的问题。遇到需要覆盖公开标签、删除 Release 或改动凭据等新决策时停止该操作并说明，不能强行重试或报告成功。
- 多行发布说明先写入临时文件，再用 `gh release edit --notes-file`，避免 shell 引号和转义破坏正文。说明覆盖相对上一版的实际变更及重要使用步骤。
- 最终检查 Release 版本、非草稿/预发布状态是否符合本次目标，所有预期附件均为 `uploaded` 且大小非零；正式最新版发布还需核对 `releases/latest`。

目前工作流有四个平台、五份安装包，以运行时 Release 附件列表为准：

| 平台 | 当前附件形式 |
| --- | --- |
| macOS Apple Silicon | `RunProject_<版本>_darwin_aarch64.dmg` |
| macOS Intel | `RunProject_<版本>_darwin_x64.dmg` |
| Windows x64 | `RunProject_<版本>_windows_x64.exe` |
| Linux x64 | `RunProject_<版本>_linux_amd64.AppImage`、`.deb` |

不要从 Rust target `x86_64-apple-darwin` 推测附件必叫 `x86_64.dmg`，也不要把五份附件数量写成适用于所有未来版本的固定断言。

### macOS 签名经验

Tauri 会将已定义但为空的 Apple 凭据变量当作凭据处理，可能导致 `security import` 导入空证书失败。工作流现有“配置 macOS 签名凭据”步骤只向后续步骤导出非空值，并保留多行内容。涉及该步骤时验证空值与多行值，不把秘密输出到日志。

未配置证书时沿用项目的 ad-hoc 签名；不要为发布成功伪造证书或修改用户安全设置。`codesign --verify` 通过只证明签名完整性，不等于 Developer ID 公证或已通过真实启动验证。

## 按需安装 macOS 版本

仅在用户要求本机更新时执行，优先安装已完成 CI 验收的 Release 附件。

1. **确认芯片和安装位置。** 检查实际运行进程路径、应用版本与 Bundle ID。用 `uname -m`、`sysctl -n hw.optional.arm64`，必要时用 `sysctl -n machdep.cpu.brand_string` 判断硬件；Rosetta 可能让进程报告 `x86_64`，不能据此认定 Intel。不要把本次机器的芯片类型固定为技能默认值。
2. **检查退出影响。** 用 `get_script_runs(running_only=true)` 检查内置脚本，并留意终端会话；该接口不覆盖外部 Kitty 或所有独立终端。结合当前安装/重启授权处理，不把旧进程退出误认为后台脚本会自动恢复。
3. **下载并核验。** 从真实附件列表选对应 DMG，下载到本次临时目录，核对 GitHub 返回的 SHA-256 digest 和大小。只读、`-nobrowse` 挂载镜像；检查 `Info.plist` 的版本、`lipo -archs` 的架构和 `codesign --verify --deep --strict`。
4. **先准备替换文件。** 用 `ditto` 将 `.app` 复制到安装目录同文件系统的临时 staging 目录，再次检查版本和签名。不要复制覆盖仍在运行的应用内容，也不修改应用数据目录。
5. **正常退出再替换。** 发送应用退出事件并确认旧进程结束；本项目关闭窗口只是隐藏，不等于退出。把旧应用暂移到 staging，安装新应用；替换失败时回退，未确认旧进程退出时不要继续覆盖。
6. **重新打开并确认。** 用 `open` 打开安装后的应用，核对安装路径、版本、新进程以及 MCP 服务重新可用。防止实际连接的仍是旧开发实例；目前服务端口可在 `src-tauri/src/mcp/mod.rs` 确认。
7. **验收后清理。** 替换文件与发布包内容保持一致，签名检查通过且新应用已运行后，卸载 DMG，清理本次 staging、临时旧应用和不再需要的下载。不删除其他目录或用户数据；失败时保留有用诊断和回退副本。

## 刷新工作区并验证真实结果

用户要求刷新时，在新原生进程启动后执行：

1. 调用 `get_workspaces` 获取当前实际工作区；按用户指定范围刷新。泛指全部工作区时，逐个用返回的精确绝对路径调用 `refresh_workspace({ path })`。
2. 再读 `get_workspaces` 和相关 `get_projects`，检查新规则、项目数量与路径是否生效，确认正常嵌套项目仍存在。不要直接改 SQLite 或前端快照来制造结果。
3. 项目数因目录变化而变化；记录本次前后值，不把历史的“42 → 11”或其他工作区数量当成通用验收条件。
4. 不用“已保存配置”“已安装文件”替代实际读取应用结果；MCP 验证业务数据不代表已经目视检查所有原生 UI。

## 最终交付说明

只报告本次有证据的状态：修改内容、相关验证、提交/分支/远端、CI、Release 与附件、本机安装版本、重新运行及工作区刷新结果。未执行的环节不要写成完成；有失败或未覆盖的原生行为时说明具体边界。

常用验收顺序：代码修复 → 测试 → 提交推送 → 标签与 CI → 附件核验 → 按需安装 → 新进程 → 按需刷新实际数据。按用户所需范围结束，不为了走完流程自动增加发布或安装操作。
