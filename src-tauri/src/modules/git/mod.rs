/// Git 模块 - 负责与仓库相关的操作
///
/// 当前支持的能力：
/// - 查询指定项目的所有本地分支
/// - 切换项目分支
///
/// 未来可以在该目录下继续扩展其他 git 相关功能
pub mod branch;

pub use branch::{__cmd__list_branches, __cmd__switch_branch, list_branches, switch_branch};
