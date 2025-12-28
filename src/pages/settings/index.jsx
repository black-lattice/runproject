import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';

function SettingsPage() {
	const {
		useKittenRemote,
		setUseKittenRemote,
		terminalType,
		setTerminalType,
		tabs,
		addTab
	} = useAppStore();

	const handleAddSettingsTab = () => {
		if (!tabs.includes('settings')) {
			addTab('settings');
		}
	};

	return (
		<div className='p-6 space-y-6'>
			<div>
				<h1 className='text-2xl font-bold text-gray-900'>设置</h1>
				<p className='text-gray-600 mt-2'>配置应用程序设置和首选项</p>
			</div>

			<div className='grid gap-6 max-w-2xl'>
				<Card>
					<CardHeader>
						<CardTitle>终端设置</CardTitle>
						<CardDescription>
							配置终端行为和显示选项
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-6'>
						<div className='flex items-center justify-between'>
							<div className='space-y-0.5 flex-1'>
								<Label className='text-base'>终端类型</Label>
								<p className='text-sm text-gray-500'>
									选择命令执行使用的终端类型
								</p>
							</div>
							<Select
								value={terminalType}
								onValueChange={setTerminalType}>
								<SelectTrigger className='w-40'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='builtin'>
										内置终端 (推荐)
									</SelectItem>
									<SelectItem value='kitty'>
										Kitty 终端
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{terminalType === 'kitty' && (
							<div className='flex items-center justify-between pl-4 border-l-2 border-gray-200'>
								<div className='space-y-0.5'>
									<Label className='text-base'>
										使用 Kitty 远程控制
									</Label>
									<p className='text-sm text-gray-500'>
										启用后使用 kitten @ 命令控制 Kitty
									</p>
								</div>
								<Switch
									checked={useKittenRemote}
									onCheckedChange={setUseKittenRemote}
								/>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>页签管理</CardTitle>
						<CardDescription>管理应用程序页签</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='flex items-center justify-between'>
							<div className='space-y-0.5'>
								<Label className='text-base'>
									添加设置页签
								</Label>
								<p className='text-sm text-gray-500'>
									将设置页面添加到页签栏
								</p>
							</div>
							<Button
								onClick={handleAddSettingsTab}
								disabled={tabs.includes('settings')}
								variant='outline'>
								{tabs.includes('settings')
									? '已添加'
									: '添加页签'}
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>关于</CardTitle>
						<CardDescription>应用程序信息</CardDescription>
					</CardHeader>
					<CardContent>
						<div className='space-y-2 text-sm text-gray-600'>
							<p>Node.js 项目工作区管理器</p>
							<p>版本: 1.0.0</p>
							<p>基于 Tauri 和 React 构建</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export default SettingsPage;
