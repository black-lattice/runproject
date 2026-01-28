import { Cpu, Key, Globe, Info, Edit, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { MODEL_OPTIONS, DEFAULT_DEEPSEEK_BASE_URL } from './constants';

/**
 * ModelDialog component for adding or editing model configurations.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is open
 * @param {Function} props.onOpenChange - Callback to change dialog open state
 * @param {Object|null} props.editingModel - The model being edited, or null for adding
 * @param {Object} props.formData - Current form data
 * @param {Function} props.onFormChange - Callback to update form data
 * @param {Function} props.onSave - Callback to save the model
 */
export function ModelDialog({
	isOpen,
	onOpenChange,
	editingModel,
	formData,
	onFormChange,
	onSave
}) {
	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
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
								onFormChange({ ...formData, model: value })
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
								onFormChange({ ...formData, api_key: e.target.value })
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
								onFormChange({ ...formData, base_url: e.target.value })
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
						onClick={() => onOpenChange(false)}
						className='text-gray-500 hover:bg-gray-100'
					>
						取消
					</Button>
					<Button 
						onClick={onSave}
						className='bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]'
					>
						{editingModel ? '保存变更' : '立即创建'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
