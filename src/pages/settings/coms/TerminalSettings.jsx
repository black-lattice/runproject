import { useAppStore } from '@/store/useAppStore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

export function TerminalSettings() {
	const {
		useKittenRemote,
		setUseKittenRemote,
		terminalType,
		setTerminalType
	} = useAppStore();

	return (
		<Card className='border-border/70 shadow-md shadow-foreground/[0.04]'>
			<CardHeader>
				<CardTitle>终端设置</CardTitle>
				<CardDescription>
					配置终端行为和显示选项
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-6'>
				<div className='flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-4'>
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
					<div className='flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-4'>
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
	);
}
