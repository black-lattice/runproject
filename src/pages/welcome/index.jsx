import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AppLogo from '@/components/AppLogo';
import {
	FolderOpen,
	Settings,
	Terminal,
	Home,
	BookOpen,
	Code,
	Zap,
	Code2
} from 'lucide-react';
import { PAGE_CONFIGS } from '@/config/routes';

function WelcomePage() {
	const navigate = useNavigate();
	const { tabs, addTab, workspaces, setSelectedProject } = useAppStore();

	const handleNavigate = tabId => {
		addTab(tabId);
		navigate(PAGE_CONFIGS[tabId].path);
	};

	const handleProjectClick = project => {
		setSelectedProject(project);
		handleNavigate('projects');
	};

	const quickActions = [
		{
			id: 'projects',
			title: '项目管理',
			description: '管理您的工作空间和项目',
			icon: FolderOpen,
			color: 'bg-blue-500',
			action: () => handleNavigate('projects')
		},
		{
			id: 'terminal',
			title: '终端管理',
			description: '创建和管理项目终端',
			icon: Terminal,
			color: 'bg-green-500',
			action: () => handleNavigate('terminal')
		},
		{
			id: 'formatter',
			title: '数据格式化',
			description: '格式化 JSON、XML、SQL 等数据',
			icon: Code2,
			color: 'bg-orange-500',
			action: () => handleNavigate('formatter')
		},
		{
			id: 'settings',
			title: '设置',
			description: '配置应用设置和首选项',
			icon: Settings,
			color: 'bg-purple-500',
			action: () => handleNavigate('settings')
		}
	];

	const recentProjects = workspaces
		.slice(0, 3)
		.flatMap(workspace =>
			workspace.projects.map(project => ({
				...project,
				workspaceName: workspace.name
			}))
		)
		.slice(0, 5);

	return (
		<div className='welcome-page h-full overflow-y-auto'>
			<div className='container mx-auto px-6 py-10 xl:py-14'>
				<div className='welcome-hero text-center mb-10'>
					<div className='flex items-center justify-center mb-5'>
						<div className='welcome-brand-mark bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-2xl'>
							<AppLogo className='block h-12 w-12' />
						</div>
					</div>
					<p className='mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary'>
						RunProject · Developer Workspace
					</p>
					<h1 className='text-3xl xl:text-4xl font-bold text-gray-900 mb-3 tracking-tight'>
						让项目启动和日常开发更轻松
					</h1>
					<p className='text-base xl:text-lg leading-7 text-gray-600 max-w-2xl mx-auto'>
						集中管理 Node.js 工作区、终端和常用命令，把重复操作留给工具。
					</p>
				</div>

				<div className='mb-10'>
					<h2 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
						<Zap className='h-5 w-5 mr-2 text-blue-600' />
						快速操作
					</h2>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
						{quickActions.map(action => {
							const Icon = action.icon;
							const isActive = tabs.includes(action.id);

							return (
								<Card
									key={action.id}
									className='welcome-action-card cursor-pointer transition-all duration-200'
									onClick={action.action}>
									<CardHeader className='p-5 pb-4'>
										<div className='flex items-center justify-between'>
											<div className={`p-3 rounded-lg ${action.color}`}>
												<Icon className='h-6 w-6 text-white' />
											</div>
											{isActive && (
												<Badge variant='secondary' className='text-xs'>
													已打开
												</Badge>
											)}
										</div>
										<CardTitle className='text-lg'>{action.title}</CardTitle>
										<CardDescription>{action.description}</CardDescription>
									</CardHeader>
									<CardContent className='px-5 pb-5'>
										<Button
											variant={isActive ? 'secondary' : 'default'}
											className='w-full'
											onClick={e => {
												e.stopPropagation();
												action.action();
											}}>
											{isActive ? '进入页面' : '立即开始'}
										</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</div>

				{recentProjects.length > 0 && (
					<div className='mb-10'>
						<h2 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
							<Code className='h-5 w-5 mr-2 text-green-600' />
							最近项目
						</h2>
						<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
							{recentProjects.map((project, index) => (
								<Card
									key={index}
									className='welcome-feature-card transition-all duration-200 cursor-pointer'
									onClick={() => handleProjectClick(project)}>
									<CardContent className='p-4'>
										<div className='flex items-start justify-between'>
											<div className='flex-1 min-w-0'>
												<h3 className='font-medium text-gray-900 truncate'>
													{project.name}
												</h3>
												<p className='text-sm text-gray-600 mt-1 truncate'>
													{project.workspaceName}
												</p>
												<p className='text-xs text-gray-500 mt-2 truncate font-mono'>
													{project.path}
												</p>
											</div>
											<Badge
												variant='outline'
												className='ml-2 text-xs flex-shrink-0'>
												{project.packageManager}
											</Badge>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				)}

				<div className='mb-10'>
					<h2 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
						<BookOpen className='h-5 w-5 mr-2 text-purple-600' />
						功能特性
					</h2>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
						<div className='welcome-feature-card text-center p-5 rounded-xl transition-all duration-200'>
							<div className='bg-blue-100 p-3 rounded-full w-fit mx-auto mb-4'>
								<FolderOpen className='h-6 w-6 text-blue-600' />
							</div>
							<h3 className='font-semibold text-gray-900 mb-2'>项目管理</h3>
							<p className='text-sm text-gray-600'>
								自动扫描和发现 Node.js 项目
							</p>
						</div>
						<div className='welcome-feature-card text-center p-5 rounded-xl transition-all duration-200'>
							<div className='bg-green-100 p-3 rounded-full w-fit mx-auto mb-4'>
								<Terminal className='h-6 w-6 text-green-600' />
							</div>
							<h3 className='font-semibold text-gray-900 mb-2'>终端集成</h3>
							<p className='text-sm text-gray-600'>
								集成 kitty 终端支持命令执行
							</p>
						</div>
						<div className='welcome-feature-card text-center p-5 rounded-xl transition-all duration-200'>
							<div className='bg-purple-100 p-3 rounded-full w-fit mx-auto mb-4'>
								<Settings className='h-6 w-6 text-purple-600' />
							</div>
							<h3 className='font-semibold text-gray-900 mb-2'>灵活配置</h3>
							<p className='text-sm text-gray-600'>
								自定义包管理器和 Node 版本
							</p>
						</div>
						<div className='welcome-feature-card text-center p-5 rounded-xl transition-all duration-200'>
							<div className='bg-orange-100 p-3 rounded-full w-fit mx-auto mb-4'>
								<Home className='h-6 w-6 text-orange-600' />
							</div>
							<h3 className='font-semibold text-gray-900 mb-2'>页签管理</h3>
							<p className='text-sm text-gray-600'>多页签界面提高工作效率</p>
						</div>
					</div>
				</div>

				<div className='text-center'>
					<div className='welcome-stats inline-flex items-center space-x-4 px-6 py-3 rounded-full'>
						<div className='flex items-center space-x-2 text-sm text-gray-600'>
							<div className='w-2 h-2 bg-green-500 rounded-full'></div>
							<span>工作区: {workspaces.length}</span>
						</div>
						<div className='w-px h-4 bg-gray-300'></div>
						<div className='flex items-center space-x-2 text-sm text-gray-600'>
							<div className='w-2 h-2 bg-blue-500 rounded-full'></div>
							<span>
								项目:{' '}
								{workspaces.reduce((sum, w) => sum + w.projects.length, 0)}
							</span>
						</div>
						<div className='w-px h-4 bg-gray-300'></div>
						<div className='flex items-center space-x-2 text-sm text-gray-600'>
							<div className='w-2 h-2 bg-purple-500 rounded-full'></div>
							<span>页签: {tabs.length}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default WelcomePage;
