import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

function Header({ onAddWorkspace, useKittenRemote, setUseKittenRemote }) {
	return (
		<header className='h-14 bg-card text-foreground border-b flex items-center justify-between px-6'>
			<h1 className='text-lg font-semibold m-0'>Node.js 项目工作台</h1>
			<div className='flex items-center gap-4'>
				<div className='flex items-center gap-2'>{useKittenRemote ? '启用' : '禁用'}
					<Switch
						id='kitten-remote'
						checked={useKittenRemote}
						onCheckedChange={setUseKittenRemote}
					/>
					<label
						htmlFor='kitten-remote'
						className='text-muted-foreground text-sm cursor-pointer'>
						Kitten远程控制
					</label>
				</div>
				<Button
					variant='outline'
					size='sm'

					onClick={onAddWorkspace}>
					+ 添加 Workspace
				</Button>
			</div>
		</header>
	);
}

export default Header;
