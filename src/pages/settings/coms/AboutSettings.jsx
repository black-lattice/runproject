import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';

export function AboutSettings() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>关于</CardTitle>
				<CardDescription>应用程序信息</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='space-y-2 text-sm text-gray-600'>
					<p>Node.js 项目工作区管理器</p>
					<p>版本: 0.1.0</p>
					<p>基于 Tauri 和 React 构建</p>
				</div>
			</CardContent>
		</Card>
	);
}
