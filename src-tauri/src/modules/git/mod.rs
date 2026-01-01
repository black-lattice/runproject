/// Git 模块 - 负责与仓库相关的操作
///
/// 当前支持的能力：
/// - 查询指定项目的所有本地分支
/// - 切换项目分支
/// - 管理 Git Worktree（创建、删除、列表）
///
/// 未来可以在该目录下继续扩展其他 git 相关功能
pub mod branch;

pub use branch::{
    __cmd__list_branches,
    __cmd__switch_branch,
    __cmd__list_worktrees,
    __cmd__create_worktree,
    __cmd__remove_worktree,
    list_branches,
    switch_branch,
    list_worktrees,
    create_worktree,
    remove_worktree,
};
