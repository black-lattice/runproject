import { useState, useEffect } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { Edit, Trash2, Plus, Play, Check, Cpu, Key, Globe, Info } from 'lucide-react';

const MODEL_OPTIONS = [
	{ value: 'gpt-4.1', label: 'gpt-4.1', provider: 'OpenAI' },
	{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini', provider: 'OpenAI' },
	{ value: 'gpt-4.1-nano', label: 'gpt-4.1-nano', provider: 'OpenAI' },
	{ value: 'deepseek-chat', label: 'deepseek-chat', provider: 'DeepSeek' },
	{ value: 'deepseek-reasoner', label: 'deepseek-reasoner', provider: 'DeepSeek' },
	{ value: 'codex-cli', label: 'codex (CLI)', provider: 'CLI' }
];

const inferProvider = model => {
	if (!model) return 'openai';
	if (model === 'codex-cli') return 'codex';
	return model.toLowerCase().startsWith('deepseek-') ? 'deepseek' : 'openai';
};

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export function AiSettings() {
	const {
		settings,
		loadSettings,
		saveSettings,
		savedModels,
		addSavedModel,
		updateSavedModel,
		deleteSavedModel
	} = useAgentStore();

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingModel, setEditingModel] = useState(null); // null for add, object for edit
	const [formData, setFormData] = useState({
		model: 'gpt-4.1-mini',
		api_key: '',
		base_url: ''
	});

	useEffect(() => {
		loadSettings().catch(() => null);
	}, [loadSettings]);

	// Initialize saved models from current settings if empty (migration)
	useEffect(() => {
		if (settings && savedModels.length === 0) {
			addSavedModel({
				provider: settings.provider,
				model: settings.model,
				api_key: settings.api_key,
				base_url: settings.base_url
			});
		}
	}, [settings, savedModels.length, addSavedModel]);

	const handleEdit = model => {
		setEditingModel(model);
		setFormData({
			model: model.model,
			api_key: model.api_key,
			base_url: model.base_url || ''
		});
		setIsDialogOpen(true);
	};

	const handleAdd = () => {
		setEditingModel(null);
		setFormData({
			model: 'gpt-4.1-mini',
			api_key: '',
			base_url: ''
		});
		setIsDialogOpen(true);
	};

	const handleDelete = id => {
		deleteSavedModel(id);
	};

	const handleActivate = async model => {
		try {
			await saveSettings({
				provider: model.provider,
				model: model.model,
				api_key: model.api_key,
				base_url: model.base_url || null
			});
		} catch (error) {
			console.error('Failed to activate model:', error);
		}
	};

	const handleSaveDialog = () => {
		const provider = inferProvider(formData.model);
		const baseUrl =
			provider === 'deepseek' && !formData.base_url
				? DEFAULT_DEEPSEEK_BASE_URL
				: formData.base_url;

		const modelData = {
			provider,
			model: formData.model,
			api_key: formData.api_key,
			base_url: baseUrl
		};

		if (editingModel) {
			updateSavedModel(editingModel.id, modelData);
		} else {
			addSavedModel(modelData);
		}
		setIsDialogOpen(false);
	};

	const isActive = model => {
		return (
			settings &&
			settings.model === model.model &&
			settings.api_key === model.api_key &&
			(settings.base_url || '') === (model.base_url || '')
		);
	};

	return (
		<Card className='shadow-sm border-gray-200'>
			<CardHeader className='pb-4'>
				<div className='flex items-center justify-between'>
					<div>
						<CardTitle className='text-xl'>AI 模型管理</CardTitle>
						<CardDescription className='mt-1'>
							管理您的 AI 模型配置，点击“激活”以切换当前使用的模型。
						</CardDescription>
					</div>
					<Button onClick={handleAdd} size='sm' className='gap-2'>
						<Plus className='w-4 h-4' /> 新增模型
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<div className='rounded-lg border border-gray-100 overflow-hidden'>
					<Table>
						<TableHeader className='bg-gray-50/50'>
							<TableRow>
								<TableHead className='w-[200px]'>模型 (Model)</TableHead>
								<TableHead>API Key</TableHead>
								<TableHead>Base URL</TableHead>
								<TableHead className='text-right'>操作</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{savedModels.length === 0 && (
								<TableRow>
									<TableCell colSpan={4} className='text-center text-gray-400 py-12'>
										<div className='flex flex-col items-center gap-2'>
											<Cpu className='w-8 h-8 opacity-20' />
											<p>暂无模型，点击右上角新增</p>
										</div>
									</TableCell>
								</TableRow>
							)}
							{savedModels.map(model => (
								<TableRow key={model.id} className='group'>
									<TableCell className='font-medium'>
										<div className='flex flex-col gap-1'>
											<div className='flex items-center gap-2'>
												<span className='text-sm text-gray-900'>{model.model}</span>
											</div>
											<span className='text-[10px] text-gray-400 uppercase tracking-wider font-semibold'>
												{model.provider}
											</span>
										</div>
									</TableCell>
									<TableCell className='font-mono text-xs text-gray-500'>
										{model.api_key
											? `${model.api_key.slice(0, 4)}••••${model.api_key.slice(-4)}`
											: <span className='italic opacity-50'>未设置</span>}
									</TableCell>
									<TableCell className='text-xs text-gray-500 max-w-[200px] truncate'>
										{model.base_url || <span className='italic opacity-50'>默认路径</span>}
									</TableCell>
									<TableCell className='text-right'>
										<div className='flex items-center justify-end gap-1'>
											<Button
												variant='ghost'
												size='icon'
												className='h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
												onClick={() => handleEdit(model)}
												title='编辑'
											>
												<Edit className='w-4 h-4' />
											</Button>
											<Button
												variant='ghost'
												size='icon'
												className='h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50'
												onClick={() => handleDelete(model.id)}
												title='删除'
											>
												<Trash2 className='w-4 h-4' />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogContent className='sm:max-w-[480px] p-0 overflow-hidden'>
						<DialogHeader className='px-6 pt-6 pb-4 border-b'>
							<div className='flex items-center gap-3'>
								<div className={`p-2 rounded-lg ${editingModel ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
									{editingModel ? <Edit className='w-5 h-5' /> : <Plus className='w-5 h-5' />}
								</div>
								<div>
									<DialogTitle className='text-lg font-bold'>
										{editingModel ? '编辑模型配置' : '添加新模型'}
									</DialogTitle>
									<p className='text-xs text-gray-500 mt-0.5'>
										配置您的 LLM 访问凭证与接口地址
									</p>
								</div>
							</div>
						</DialogHeader>
						
						<div className='space-y-6 py-6 px-8'>
							<div className='space-y-3'>
								<Label className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
									<Cpu className='w-4 h-4 text-gray-400' />
									模型选择
								</Label>
								<Select
									value={formData.model}
									onValueChange={value =>
										setFormData(prev => ({ ...prev, model: value }))
									}
								>
									<SelectTrigger className='h-10 bg-gray-50/50 border-gray-200 focus:ring-emerald-500'>
										<SelectValue placeholder='选择一个支持的模型' />
									</SelectTrigger>
									<SelectContent>
										{MODEL_OPTIONS.map(opt => (
											<SelectItem key={opt.value} value={opt.value} className='py-2'>
												<div className='flex flex-col'>
													<span className='font-medium'>{opt.label}</span>
													<span className='text-[10px] text-gray-400'>{opt.provider}</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className='text-[11px] text-gray-400 flex items-center gap-1.5 px-1'>
									<Info className='w-3 h-3' />
									系统将根据模型名称自动识别 Provider
								</p>
							</div>

							<div className='space-y-3'>
								<Label className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
									<Key className='w-4 h-4 text-gray-400' />
									API Key
								</Label>
								<Input
									type='password'
									value={formData.api_key}
									onChange={e =>
										setFormData(prev => ({ ...prev, api_key: e.target.value }))
									}
									placeholder='输入您的 API 访问密钥'
									className='h-10 bg-gray-50/50 border-gray-200 focus:ring-emerald-500'
								/>
								<p className='text-[11px] text-gray-400 px-1'>
									密钥将加密存储在本地，不会上传到任何服务器。
								</p>
							</div>

							<div className='space-y-3'>
								<Label className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
									<Globe className='w-4 h-4 text-gray-400' />
									Base URL <span className='text-[10px] font-normal text-gray-400'>(可选)</span>
								</Label>
								<Input
									value={formData.base_url}
									onChange={e =>
										setFormData(prev => ({ ...prev, base_url: e.target.value }))
									}
									placeholder={
										formData.model.startsWith('deepseek') 
											? DEFAULT_DEEPSEEK_BASE_URL 
											: 'https://api.openai.com/v1'
									}
									className='h-10 bg-gray-50/50 border-gray-200 focus:ring-emerald-500'
								/>
								<p className='text-[11px] text-gray-400 px-1'>
									自定义接口代理地址，留空则使用官方默认地址。
								</p>
							</div>
						</div>

						<DialogFooter className='px-6 py-4 border-t gap-3 bg-gray-50/50'>
							<Button 
								variant='ghost' 
								onClick={() => setIsDialogOpen(false)}
								className='text-gray-500 hover:bg-gray-100'
							>
								取消
							</Button>
							<Button 
								onClick={handleSaveDialog}
								className='bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]'
							>
								{editingModel ? '保存变更' : '立即创建'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
