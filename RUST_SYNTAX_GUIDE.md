# Rust 语法全景图（RunProject 专用）

> 以语法知识点为主轴，由浅入深梳理 `@src-tauri/src` 下全部 Rust 文件；每一小节给出项目内真实代码片段作为示例，方便对照学习。

## 0. 使用方式
- 顺序阅读可完成“基础 → 提升 → 进阶”的语法栈，也可按需跳转到具体章节。
- 所有示例都直接摘自 `src-tauri/src`，便于定位并进一步探索上下文。
- 章节末尾附“延伸练习”，指导在 RunProject 场景下举一反三。

---

## 1. 变量、绑定与可变性
- **不可变绑定**（默认）
  ```rust
  // src-tauri/src/modules/project_scanner.rs
  let workspace_dir = PathBuf::from(workspace_path);
  ```
  一旦绑定不可再修改，符合 Rust “不可变优先”理念。
- **可变绑定**：使用 `let mut`
  ```rust
  // src-tauri/src/lib.rs
  let mut result_output = String::new();
  ```
  仅在需要累加或重赋值时引入 `mut`，降低并发风险。

**练习**：在 `execute_project_command` 里尝试用 `push_str` 替换手写字符串拼接，体会 `mut String` 的最小使用范围。

---

## 2. 基本类型与字符串处理
- **字符串切片 & 所有权**：`fn greet(name: &str) -> String`
  ```rust
  // src-tauri/src/lib.rs
  fn greet(name: &str) -> String {
      format!("Hello, {}! You've been greeted from Rust!", name)
  }
  ```
  形参使用 `&str`（借用），返回 `String`（拥有所有权）。
- **路径类型**：`Path` + `PathBuf`
  ```rust
  // src-tauri/src/modules/project_scanner.rs
  let package_json_path = path.join("package.json");
  ```
  `PathBuf` 适合可变/拼接场景，`&Path` 用于只读访问。

**练习**：在 `detect_package_manager` 中新增 `bun.lockb` 检测，巩固 `PathBuf::join` 与字符串转换。

---

## 3. 所有权、借用与引用链
- **获取与转借**：`add_workspace` 先拿到 `String` 所有权，再多次以 `&path` 借用。
  ```rust
  // src-tauri/src/lib.rs
  fn add_workspace(path: String) -> Result<project_scanner::Workspace, String> {
      let workspace_name = Path::new(&path).file_name().unwrap().to_str().unwrap().to_string();
      let projects = project_scanner::scan_workspace(&path)?;
      Ok(project_scanner::Workspace { path, name: workspace_name, projects })
  }
  ```
- **Option 返回**：`detect_node_version(dir: &Path) -> Option<String>` 根据不同文件来源返回新的 `String`。

**练习**：把 `ensure_node_version` 改造为接受 `&str`，体会 `String` 与 `&str` 在调用方/被调方的取舍。

---

## 4. 控制流与布尔逻辑
- **条件语句**：`if let Some(version) = node_version`（`lib.rs`）结合 `Option` 解构。
- **循环**：`for entry in entries`（`project_scanner.rs`）迭代目录；`while retries < config.max_retries`（`kitty/connection.rs`）实现带重试逻辑的轮询。

```rust
// src-tauri/src/modules/kitty/connection.rs
while retries < config.max_retries {
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!("kitty 进程提前退出: {}", status));
    }
    std::thread::sleep(std::time::Duration::from_millis(config.retry_delay_ms));
    ...
}
```

**练习**：在 `start_kitty_instance` 中加入 `break` 语句，将成功场景提前跳出循环。

---

## 5. 模式匹配与解构
- **`match` 枚举值**：`NodeVersionManager::Nvm | Fnm`（`nvm_manager.rs`）集中处理不同分支。
  ```rust
  // src-tauri/src/modules/nvm_manager.rs
  match manager {
      NodeVersionManager::Nvm => { ... }
      NodeVersionManager::Fnm => { ... }
  }
  ```
- **`if let` / `while let`**：大量用于 `Result`/`Option` 的早返回，例如 `if let Ok(entries) = fs::read_dir(workspace_path)`。
- **迭代器配合 pattern**：`lines().filter_map(|line| ...)`（`parse_versions`）借 `filter_map` 只保留满足条件的 token。

**练习**：把 `switch_to_highest_version` 的 `if let Some(highest)` 改写为 `match`，体验穷举风格的可读性。

---

## 6. 结构体、枚举与数据建模
- **结构体 + serde**：
  ```rust
  // src-tauri/src/modules/project_scanner.rs
  #[derive(Debug, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct Project {
      pub name: String,
      pub path: String,
      pub node_version: Option<String>,
      pub package_manager: String,
      pub commands: Vec<ProjectCommand>,
  }
  ```
- **枚举**：
  ```rust
  // src-tauri/src/modules/kitty/core.rs
  #[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
  pub enum TabStatus {
      Running,
      Completed,
      Error,
      Terminated,
  }
  ```
- **小型业务结构体**：`GitBranch { name, is_current }`（`git/branch.rs`）展示 `bool` 字段标识当前状态。

**练习**：为 `ProjectCommand` 添加 `description: Option<String>`，练习给结构体扩展字段并保持 `serde` 兼容。

---

## 7. `impl`、trait 与默认实现
- **枚举方法**：`impl NodeVersionManager { fn label(&self) -> &'static str }` 返回静态字符串。
- **结构体默认值**：
  ```rust
  // src-tauri/src/modules/kitty/core.rs
  impl Default for KittyConfig {
      fn default() -> Self {
          Self { socket_prefix: "kitty-runproject".into(), max_retries: 20, retry_delay_ms: 500, config_file: Some("NONE".into()) }
      }
  }
  ```
- **通用工具函数**：`get_current_timestamp()`（`kitty/core.rs`）作为 `impl` 外的自由函数提供共享逻辑。

**练习**：给 `KittyConfig` 增加 `pub fn with_socket_prefix(prefix: &str) -> Self`，熟悉关联函数的写法。

---

## 8. 模块系统与可见性
- **模块声明与再导出**：
  ```rust
  // src-tauri/src/modules/mod.rs
  pub mod git;
  pub mod kitty;
  pub mod nvm_manager;
  pub mod project_scanner;
  ```
  ```rust
  // src-tauri/src/modules/kitty/mod.rs
  pub mod core;
  pub use core::{get_current_timestamp, KittyConfig, KittyTab, TabStatus};
  ```
  通过 `pub use` 将子模块 API 直接暴露给上层，减少长路径引用。
- **根路径引用**：在 `tabs.rs` 内使用 `crate::modules::kitty::core::KittyTab` 明确跨文件依赖。

**练习**：尝试新增 `pub mod mcp;` 并在 `lib.rs` 里引用，体验模块与 `use` 的配合。

---

## 9. 宏、属性与生成代码
- **属性宏**：`#[tauri::command]`（`lib.rs`、`kitty/executor.rs`、`kitty/process.rs`、`git/branch.rs`）把普通函数暴露为前端可调用命令。
- **派生宏**：`#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]` 一次性实现多个 trait。
- **`lazy_static!`**：创建全局 `Arc<Mutex<_>>`
  ```rust
  // src-tauri/src/modules/kitty/core.rs
  lazy_static::lazy_static! {
      pub static ref KITTY_TAB_MANAGER: Arc<Mutex<HashMap<String, KittyTab>>> = Arc::new(Mutex::new(HashMap::new()));
  }
  ```
- **条件编译属性**：`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`（`main.rs`）、`#[cfg(target_os = "macos")]`（`kitty/connection.rs`）。

**练习**：为 `GitBranch` 增加 `#[derive(PartialEq, Eq)]`，感受派生宏的扩展性。

---

## 10. 函数、方法与闭包
- **自由函数**：`fn scan_workspace(workspace_path: &str) -> Result<Vec<Project>, String>`（长生命周期的工具函数）。
- **方法调用**：`tab.status = status;`（`tabs.rs`）演示可变引用下的字段修改。
- **闭包使用**：`scripts_object.iter().map(|(name, script)| ...)`（由 `for` 实现，亦可改成 `iter().filter_map`）。
- **Builder 链式调用**：
  ```rust
  // src-tauri/src/lib.rs
  tauri::Builder::default()
      .plugin(tauri_plugin_opener::init())
      .plugin(tauri_plugin_dialog::init())
      .plugin(McpBuilder::default().build())
  ```

**练习**：将 `project_scanner::extract_scripts` 内部 `for` 改为迭代器链，熟悉闭包签名 `|key, value|`.

---

## 11. 集合、迭代器与算法
- **Vec 构建与 push**：`projects.push(Project { ... })`（`project_scanner.rs`）
- **HashMap 操作**：`manager.insert(command_id.clone(), child);`（`kitty/executor.rs`）
- **retain 过滤**：
  ```rust
  // src-tauri/src/modules/kitty/tabs.rs
  manager.retain(|_, tab| !matches!(tab.status, TabStatus::Completed | TabStatus::Error | TabStatus::Terminated));
  ```
- **去重排序**：`versions.sort(); versions.dedup();`（`parse_versions`）

**练习**：在 `cleanup_completed_processes` 中统计被删除条数并写入日志，练习 `len()` 差值计算。

---

## 12. 错误处理与 `Result`/`Option`
- **`Result` 传播**：大量 `?`（`scan_workspace`, `detect_manager` 等）简化错误向上传递。
- **自定义错误信息**：
  ```rust
  // src-tauri/src/modules/nvm_manager.rs
  .map_err(|e| format!("执行命令失败: {}", e))?
  ```
- **多层错误记录**：`execute_project_command` 把每个步骤写入 `result_output`，再根据 `status.success()` 决定 `Ok/Err`.

**练习**：用 `thiserror` 定义一个错误枚举替换 `String`，实践 `From`/`Display` 实现。

---

## 13. 并发、同步与全局状态
- **`Arc<Mutex<_>>`** 管理跨线程共享数据（`KITTY_TAB_MANAGER`, `PROCESS_MANAGER`）。
- **锁使用**：
  ```rust
  // src-tauri/src/modules/kitty/process.rs
  if let Ok(mut manager) = PROCESS_MANAGER.lock() {
      if let Some(_child) = manager.remove(&command_id) {
          process_found = true;
      }
  }
  ```
- **虚拟进程记录**：`std::process::Command::new("echo")...spawn()` 作为占位（`kitty/executor.rs`），展示如何在持锁范围内写入 `HashMap`。

**练习**：为 `get_all_tabs` 返回值增加排序，体验在锁作用域内操作 `Vec`.

---

## 14. 文件系统、进程与系统交互
- **读取文件**：`fs::read_to_string`、`serde_json::from_str`（`project_scanner.rs`）演示同步 IO + JSON 解析。
- **目录遍历**：`if let Ok(entries) = fs::read_dir(workspace_path)`。
- **外部命令**：
  ```rust
  // src-tauri/src/modules/kitty/executor.rs
  std::process::Command::new("bash")
      .arg("-c")
      .arg(&kitty_command)
      .spawn()
  ```
- **同步 vs 异步**：`spawn()`（异步返回 `Child`）与 `output()`（同步等待）在 `kitty/executor.rs`、`kitty/tabs.rs` 中都有示例。
- **Git/NVM 调用**：`Command::new("git")...`（`git/branch.rs`）和 `Command::new("fnm")`（`nvm_manager.rs`）展示直接调用 CLI 的语法。

**练习**：在 `project_scanner.rs` 中加入 `fs::canonicalize`，体验 `Result<PathBuf, io::Error>` 的错误处理。

---

## 15. 条件编译与跨平台
- **入口属性**：`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`（`main.rs`）避免 Windows release 弹出终端。
- **平台特定逻辑**：
  ```rust
  // src-tauri/src/modules/kitty/connection.rs
  #[cfg(target_os = "macos")]
  {
      if let Some(path) = socket_path.strip_prefix("unix:") {
          let path = Path::new(path);
          if path.exists() {
              let _ = std::fs::remove_file(path);
          }
      }
  }
  ```
- **移动端入口**：`#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()`（`lib.rs`）。

**练习**：为 `wrap_command_with_node` 添加 `#[cfg(target_os = "windows")]` 分支，练习多平台 shell 语法差异。

---

## 16. Tauri 命令、插件与前后端桥接
- **命令定义**：任意函数加 `#[tauri::command]` 即可被 `tauri::generate_handler!`（`lib.rs`）注册。
- **Kitty 扩展**：`execute_command_in_kitty`、`execute_command_with_kitten`（`kitty/executor.rs`）演示命令参数如何直接映射到前端调用。
- **Git/NVM 命令**：`list_branches`、`switch_branch`（`git/branch.rs`），`get_nvm_status` 等函数全都通过命令宏暴露。
- **插件装配**：`tauri::Builder::default().plugin(...)`（`lib.rs`）串联多个插件初始化。

**练习**：新增一个 `#[tauri::command] fn shutdown_kitty()`，内部复用 `process::shutdown_all_kitty_instances`，熟悉命令注册流程。

---

## 17. 文件覆盖映射（确保示例来源遍布全部 Rust 文件）

| 文件 | 语法主题 |
| --- | --- |
| `src-tauri/src/main.rs` | 条件编译（§15） |
| `src-tauri/src/lib.rs` | 变量、所有权、命令、插件（§1-3, §10, §16） |
| `src-tauri/src/modules/mod.rs` | 模块声明（§8） |
| `src-tauri/src/modules/project_scanner.rs` | 变量、结构体、文件 IO、迭代（§1-6, §11, §14） |
| `src-tauri/src/modules/nvm_manager.rs` | 枚举、match、错误处理、外部命令（§3, §5, §9, §14） |
| `src-tauri/src/modules/kitty/mod.rs` | 模块再导出（§8） |
| `src-tauri/src/modules/kitty/core.rs` | 枚举、impl、lazy_static、并发（§6-7, §9, §13） |
| `src-tauri/src/modules/kitty/connection.rs` | 控制流、条件编译、系统交互（§4-5, §14-15） |
| `src-tauri/src/modules/kitty/executor.rs` | 命令导出、集合、并发记录（§5, §11, §16） |
| `src-tauri/src/modules/kitty/process.rs` | Mutex 使用、系统命令（§11, §13-14, §16） |
| `src-tauri/src/modules/kitty/tabs.rs` | HashMap、retain、外部命令（§6, §11, §14） |
| `src-tauri/src/modules/git/mod.rs` | 模块/命令桥接（§8, §16） |
| `src-tauri/src/modules/git/branch.rs` | 结构体、match、Command（§6, §9, §14, §16） |

---

## 18. 延伸练习
1. **泛型与 trait bound**：为 `run_command` 抽象出 `Fn(&Output) -> T` 的回调，感受泛型函数语法。
2. **自定义错误类型**：使用 `thiserror` 创建 `KittyError`，替换 `String`；练习 `#[derive(Error)]`。
3. **异步语法**：把 `execute_command_with_kitten` 改写为 `async fn` 并使用 `tokio::process::Command`，体验 `.await`。
4. **单元测试**：在 `project_scanner.rs` 末尾添加 `#[cfg(test)] mod tests`，熟悉 `cargo test` 语法。

---

通过以上章节，可以按照语法主题逐一定位 RunProject 中的真实实现，确保对“从基础到高级”的 Rust 特性都有实战示例。需要扩展功能时，再回到相应语法段落查阅即可。祝顺利！ 
