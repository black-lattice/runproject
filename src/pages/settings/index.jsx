import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAgentStore } from '@/store/useAgentStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const modelGroups = [
	{
		label: 'OpenAI',
		models: [
			{ value: 'gpt-4.1', label: 'gpt-4.1' },
			{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
			{ value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' }
		]
	},
	{
		label: 'DeepSeek',
		models: [
			{ value: 'deepseek-chat', label: 'deepseek-chat' },
			{ value: 'deepseek-reasoner', label: 'deepseek-reasoner' }
		]
	}
];

const inferProvider = model =>
	model?.toLowerCase().startsWith('deepseek-') ? 'deepseek' : 'openai';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

function SettingsPage() {
	const {
		useKittenRemote,
		setUseKittenRemote,
		terminalType,
		setTerminalType,
		tabs,
		addTab
	} = useAppStore();

	const { settings, loadSettings, saveSettings, settingsStatus } = useAgentStore();

	const [aiSettings, setAiSettings] = useState({
		provider: 'openai',
		model: 'gpt-4.1-mini',
		api_key: '',
		base_url: ''
	});
	const [saveStatus, setSaveStatus] = useState('');

	useEffect(() => {
		loadSettings().catch(() => null);
	}, [loadSettings]);

	useEffect(() => {
		if (settings) {
			setAiSettings({
				provider: settings.provider || 'openai',
				model: settings.model || 'gpt-4.1-mini',
				api_key: settings.api_key || '',
				base_url: settings.base_url || ''
			});
		}
	}, [settings]);

	const handleSaveAiSettings = async () => {
		setSaveStatus('saving');
		try {
			const provider = inferProvider(aiSettings.model);
			const baseUrl =
				provider === 'deepseek' && !aiSettings.base_url
					? DEFAULT_DEEPSEEK_BASE_URL
					: aiSettings.base_url || null;
			
			await saveSettings({
				provider,
				model: aiSettings.model,
				api_key: aiSettings.api_key,
				base_url: baseUrl
			});
			setSaveStatus('saved');
			setTimeout(() => setSaveStatus(''), 2000);
		} catch (error) {
			console.error('Failed to save settings:', error);
			setSaveStatus('error');
		}
	};

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
						<CardTitle>AI 模型设置</CardTitle>
						<CardDescription>
							配置 Agent 使用的 LLM 模型和 API 密钥
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='space-y-2'>
							<Label>模型选择</Label>
							<Select
								value={aiSettings.model}
								onValueChange={value =>
									setAiSettings(prev => ({
										...prev,
										model: value,
										provider: inferProvider(value),
										base_url:
											inferProvider(value) === 'deepseek'
												? DEFAULT_DEEPSEEK_BASE_URL
												: ''
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder='选择模型' />
								</SelectTrigger>
								<SelectContent>
									{modelGroups.map(group => (
										<div key={group.label}>
											<div className='px-2 py-1 text-xs text-gray-400 font-semibold'>
												{group.label}
											</div>
											{group.models.map(model => (
												<SelectItem key={model.value} value={model.value}>
													{model.label}
												</SelectItem>
											))}
										</div>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className='space-y-2'>
							<Label>API Key</Label>
							<Input
								type='password'
								value={aiSettings.api_key}
								onChange={e =>
									setAiSettings(prev => ({ ...prev, api_key: e.target.value }))
								}
								placeholder='sk-...'
							/>
							<p className='text-xs text-gray-500'>
								您的 API 密钥将安全地存储在本地。
							</p>
						</div>

						<div className='space-y-2'>
							<Label>Base URL (可选)</Label>
							<Input
								value={aiSettings.base_url}
								onChange={e =>
									setAiSettings(prev => ({ ...prev, base_url: e.target.value }))
								}
								placeholder={
									aiSettings.provider === 'deepseek'
										? DEFAULT_DEEPSEEK_BASE_URL
										: 'https://api.openai.com/v1'
								}
							/>
						</div>

						<div className='flex items-center justify-end gap-2 pt-2'>
							{saveStatus === 'saved' && (
								<span className='text-xs text-green-600'>保存成功</span>
							)}
							{saveStatus === 'error' && (
								<span className='text-xs text-red-600'>保存失败</span>
							)}
							<Button 
								onClick={handleSaveAiSettings} 
								disabled={settingsStatus === 'saving' || saveStatus === 'saving'}
							>
								{saveStatus === 'saving' ? '保存中...' : '保存配置'}
							</Button>
						</div>
					</CardContent>
				</Card>

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