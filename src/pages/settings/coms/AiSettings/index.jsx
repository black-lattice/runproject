import { useState, useEffect } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
	CardContent
} from '@/components/ui/card';
import { Plus } from 'lucide-react';

import { ModelTable } from './ModelTable';
import { ModelDialog } from './ModelDialog';
import { AgentGlobalSettings } from './AgentGlobalSettings';
import { inferProvider, DEFAULT_DEEPSEEK_BASE_URL } from './constants';

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
	const [editingModel, setEditingModel] = useState(null);
	const [formData, setFormData] = useState({
		model: 'gpt-4.1-mini',
		api_key: '',
		base_url: ''
	});

	const [systemPrompt, setSystemPrompt] = useState('');

	useEffect(() => {
		loadSettings().then(s => {
			if (s) setSystemPrompt(s.system_prompt || '');
		}).catch(() => null);
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

	const handleActivate = async model => {
		try {
			await saveSettings({
				...settings,
				provider: model.provider,
				model: model.model,
				api_key: model.api_key,
				base_url: model.base_url || null
			});
		} catch (error) {
			console.error('Failed to activate model:', error);
		}
	};

	const handleSavePrompt = async () => {
		try {
			await saveSettings({
				...settings,
				system_prompt: systemPrompt
			});
		} catch (error) {
			console.error('Failed to save system prompt:', error);
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

	return (
		<div className='space-y-6'>
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
					<ModelTable
						models={savedModels}
						activeSettings={settings}
						onEdit={handleEdit}
						onDelete={deleteSavedModel}
						onActivate={handleActivate}
					/>

					<ModelDialog
						isOpen={isDialogOpen}
						onOpenChange={setIsDialogOpen}
						editingModel={editingModel}
						formData={formData}
						onFormChange={setFormData}
						onSave={handleSaveDialog}
					/>
				</CardContent>
			</Card>

			<AgentGlobalSettings
				systemPrompt={systemPrompt}
				onPromptChange={setSystemPrompt}
				onSave={handleSavePrompt}
			/>
		</div>
	);
}

export default AiSettings;