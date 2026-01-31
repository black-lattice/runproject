import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const getActionDescription = (action) => {
	if (!action?.params) return '请求执行操作';
	const params = action.params;

	// Detect file operations
	if (params.file_path) {
		const pathParts = params.file_path.split('/');
		const fileName = pathParts.length > 1 
			? pathParts.slice(-2).join('/') 
			: pathParts[0];

		if (params.old_string && params.new_string) {
			return `修改文件内容：${fileName}`;
		}
		if (params.content) {
			return `写入文件内容：${fileName}`;
		}
		return `访问文件：${fileName}`;
	}

	// Detect command operations
	const cmd = params.command || params.codex_command;
	if (cmd) {
		const cmdStr = Array.isArray(cmd) ? cmd.join(' ') : String(cmd).trim();
		
		// Heuristic mapping for common commands
		if (/^(npm|pnpm|yarn)\s+install/.test(cmdStr)) return '安装项目依赖';
		if (/^(npm|pnpm|yarn)\s+run\s+test/.test(cmdStr)) return '运行自动化测试';
		if (/^(npm|pnpm|yarn)\s+run\s+build/.test(cmdStr)) return '执行项目构建';
		if (/^(npm|pnpm|yarn)\s+run/.test(cmdStr)) return '运行项目脚本';
		
		if (/^git\s+commit/.test(cmdStr)) return '提交代码更改';
		if (/^git\s+push/.test(cmdStr)) return '推送代码更改';
		if (/^git\s+pull/.test(cmdStr)) return '更新本地代码';
		if (/^git\s+status/.test(cmdStr)) return '检查文件状态';
		if (/^git\s+add/.test(cmdStr)) return '跟踪文件更改';
		if (/^git\s+checkout/.test(cmdStr) || /^git\s+switch/.test(cmdStr)) return '切换代码分支';
		
		if (/^ls\s/.test(cmdStr) || cmdStr === 'ls') return '浏览目录文件';
		if (/^find\s/.test(cmdStr)) return '搜索文件';
		if (/^grep\s/.test(cmdStr) || /^rg\s/.test(cmdStr)) return '搜索文本内容';
		if (/^mkdir\s/.test(cmdStr)) return '创建新文件夹';
		if (/^rm\s/.test(cmdStr)) return '删除文件或目录';
		if (/^cp\s/.test(cmdStr)) return '复制文件';
		if (/^mv\s/.test(cmdStr)) return '移动或重命名文件';
		
		const bin = cmdStr.split(' ')[0];
		return `运行系统工具 (${bin})`;
	}

	return '执行一项系统操作';
};
