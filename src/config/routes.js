import { Home, FolderOpen, Settings, Terminal, Code2 } from 'lucide-react';

export const PAGE_CONFIGS = {
	welcome: {
		id: 'welcome',
		path: '/welcome',
		title: '首页',
		icon: Home,
		closable: false,
		fixed: true // 标记为固定在左侧
	},
	projects: {
		id: 'projects',
		path: '/projects',
		title: '项目管理',
		icon: FolderOpen,
		closable: true
	},
	settings: {
		id: 'settings',
		path: '/settings',
		title: '设置',
		icon: Settings,
		closable: true
	},
	terminal: {
		id: 'terminal',
		path: '/terminal',
		title: '终端',
		icon: Terminal,
		closable: true
	},
	formatter: {
		id: 'formatter',
		path: '/formatter',
		title: '数据格式化',
		icon: Code2,
		closable: true
	}
};
