import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

function OpenProjectFolderButton({ project, compact = false }) {
	const [opening, setOpening] = useState(false);
	const pending = useRef(false);
	const { toast } = useToast();
	const label = `打开 ${project.name} 的文件夹`;

	const handleOpen = async event => {
		event.stopPropagation();
		if (pending.current || !project.path) return;
		pending.current = true;
		setOpening(true);
		try {
			await invoke('open_in_finder', { path: project.path });
		} catch (error) {
			toast({ title: '打开项目文件夹失败', description: String(error), variant: 'destructive' });
		} finally {
			pending.current = false;
			setOpening(false);
		}
	};

	return (
		<Button
			type='button'
			variant={compact ? 'ghost' : 'outline'}
			size={compact ? 'icon' : 'sm'}
			className={compact ? 'h-8 w-8 shrink-0 text-muted-foreground hover:text-primary' : ''}
			data-no-select='true'
			aria-label={label}
			title={`${label}\n${project.path}`}
			disabled={opening || !project.path}
			onClick={handleOpen}
		>
			{opening ? <Loader2 aria-hidden='true' className='w-4 h-4 animate-spin' /> : <FolderOpen aria-hidden='true' className='w-4 h-4' />}
			{!compact && (opening ? '正在打开…' : '打开文件夹')}
		</Button>
	);
}

export default OpenProjectFolderButton;
