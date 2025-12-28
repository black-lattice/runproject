// Kitty模块 - 终端管理器
//
// 这个模块提供了对Kitty终端的完整控制能力，包括：
// - 连接管理：启动、连接、关闭Kitty实例
// - 标签页管理：创建、关闭、列出标签页
// - 命令执行：在标签页中执行命令
// - 进程管理：监控和管理运行中的进程

// 核心类型和配置
pub mod core;
pub use core::{get_current_timestamp, KittyConfig, KittyTab, TabStatus};

// 连接管理
pub mod connection;
pub use connection::{
    check_kitten_available, check_kitty_installed, get_kitty_instance_info, get_socket_path,
    start_kitty_instance, stop_kitty_instance, test_kitty_connection,
};

// 标签页管理
pub mod tabs;
pub use tabs::{
    cleanup_completed_tabs, close_kitty_tab, create_kitty_tab, get_all_tabs, get_tab_status,
    list_kitty_tabs, register_kitty_tab, unregister_kitty_tab, update_tab_status,
};

// 命令执行
pub mod executor;
pub use executor::{
    build_execution_command, execute_command_in_kitty, execute_command_with_kitten,
};

// 进程管理
pub mod process;
pub use process::{
    cleanup_completed_processes, get_running_processes, shutdown_all_kitty_instances,
    terminate_command,
};
