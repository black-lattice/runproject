import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';

export function TabSettings() {
	const { tabs, addTab } = useAppStore();

	const handleAddSettingsTab = () => {
		if (!tabs.includes('settings')) {
			addTab('settings');
		}
	};

	return (
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
	);
}
