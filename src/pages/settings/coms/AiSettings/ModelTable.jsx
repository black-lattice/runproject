import { Cpu, Edit, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';

/**
 * ModelTable component displays a list of saved models.
 * @param {Object} props
 * @param {Array} props.models - List of saved models
 * @param {Function} props.onEdit - Callback when edit button is clicked
 * @param {Function} props.onDelete - Callback when delete button is clicked
 */
export function ModelTable({ models, onEdit, onDelete }) {
	return (
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
					{models.length === 0 && (
						<TableRow>
							<TableCell colSpan={4} className='text-center text-gray-400 py-12'>
								<div className='flex flex-col items-center gap-2'>
									<Cpu className='w-8 h-8 opacity-20' />
									<p>暂无模型，点击右上角新增</p>
								</div>
							</TableCell>
						</TableRow>
					)}
					{models.map(model => (
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
										onClick={() => onEdit(model)}
										title='编辑'
									>
										<Edit className='w-4 h-4' />
									</Button>
									<Button
										variant='ghost'
										size='icon'
										className='h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50'
										onClick={() => onDelete(model.id)}
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
	);
}
