import { useState, useEffect } from 'react';
import { getMcpConfig, saveMcpConfig } from '@/services/agent';
import { Button } from '@/components/ui/button';
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
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import {
	Edit,
	Plus,
	Terminal,
	Layers,
	FileCode,
	RefreshCw,
	AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function McpSettings() {
	const [configStr, setConfigStr] = useState(`{
  "mcpServers": {}
}`);
	const [servers, setServers] = useState([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	const loadConfig = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const content = await getMcpConfig();
			let formatted = content;
			try {
				formatted = JSON.stringify(JSON.parse(content), null, 2);
			} catch (e) {
				console.warn('Config is not valid JSON, using raw:', e);
			}
			setConfigStr(formatted);
			parseConfig(formatted);
		} catch (err) {
			setError(`读取配置失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const parseConfig = (content) => {
		try {
			const json = JSON.parse(content);
			const mcpServers = json.mcpServers || {};
			const serverList = Object.entries(mcpServers).map(([id, config]) => ({
				id,
				name: id,
				command: config.command,
				args: config.args || []
			}));
			setServers(serverList);
		} catch (err) {
			console.error('Failed to parse MCP config:', err);
		}
	};

	useEffect(() => {
		loadConfig();
	}, []);

	const handleSave = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const parsed = JSON.parse(configStr);
			const normalized = JSON.stringify(parsed, null, 2);
			await saveMcpConfig(normalized);
			setConfigStr(normalized);
			parseConfig(normalized);
			setIsDialogOpen(false);
		} catch (err) {
			setError(`保存失败: ${err.message || err}`);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card className='shadow-sm border-gray-200'>
			<CardHeader className='pb-4'>
				<div className='flex items-center justify-between'>
					<div>
						<CardTitle className='text-xl'>MCP 服务器管理</CardTitle>
						<CardDescription className='mt-1'>
							管理基于 Model Context Protocol 的扩展。点击“直接编辑配置”通过 JSON 配置文件进行增删改。
						</CardDescription>
					</div>
					<div className='flex gap-2'>
						<Button variant='outline' size='sm' onClick={loadConfig} disabled={isLoading}>
							<RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> 刷新
						</Button>
						<Button onClick={() => setIsDialogOpen(true)} size='sm' className='gap-2 bg-emerald-600 hover:bg-emerald-700'>
							<FileCode className='w-4 h-4' /> 直接编辑配置 (JSON)
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{error && (
					<Alert variant='destructive' className='mb-4'>
						<AlertCircle className='h-4 w-4' />
						<AlertTitle>错误</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className='rounded-lg border border-gray-100 overflow-hidden'>
					<Table>
						<TableHeader className='bg-gray-50/50'>
							<TableRow>
								<TableHead className='w-[180px]'>标识符 (ID)</TableHead>
								<TableHead>启动命令 (Command)</TableHead>
								<TableHead>参数 (Args)</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{servers.length === 0 && (
								<TableRow>
									<TableCell colSpan={3} className='text-center text-gray-400 py-12'>
										<div className='flex flex-col items-center gap-2'>
											<Layers className='w-8 h-8 opacity-20' />
											<p>暂无 MCP 服务器配置</p>
										</div>
									</TableCell>
								</TableRow>
							)}
							{servers.length > 0 && servers.map(server => (
								<TableRow key={server.id} className='group hover:bg-gray-50/50'>
									<TableCell className='font-medium'>
										<div className='flex flex-col gap-1'>
											<span className='text-sm text-gray-900'>{server.name}</span>
										</div>
									</TableCell>
									<TableCell className='font-mono text-xs text-gray-600'>
										<div className='flex items-center gap-1.5'>
											<Terminal className='w-3 h-3 text-gray-400' />
											{server.command}
										</div>
									</TableCell>
									<TableCell className='text-xs text-gray-500 font-mono'>
										{server.args?.join(' ') || '-'}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogContent className='sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden'>
						<DialogHeader className='px-6 pt-6 pb-4 border-b bg-white shrink-0'>
							<div className='flex items-center gap-3'>
								<div className='p-2 rounded-lg bg-emerald-50 text-emerald-600'>
									<FileCode className='w-5 h-5' />
								</div>
								<div>
									<DialogTitle className='text-lg font-bold'>
										编辑 MCP 配置文件 (mcp_config.json)
									</DialogTitle>
									<p className='text-xs text-gray-500 mt-0.5'>
										遵循标准的 MCP 配置 JSON 格式。修改后将立即影响 Agent 的能力。
									</p>
								</div>
							</div>
						</DialogHeader>
						
						<div className='flex-1 overflow-hidden p-4 bg-gray-900'>
							<textarea
								value={configStr}
								onChange={e => setConfigStr(e.target.value)}
								spellCheck={false}
								className='w-full h-full bg-transparent text-emerald-400 font-mono text-sm resize-none focus:outline-none custom-scrollbar p-2'
								placeholder='{
  "mcpServers": {}
}'
							/>
						</div>

						<DialogFooter className='px-6 py-4 border-t gap-3 bg-gray-50/50 shrink-0'>
							<div className='flex-1 text-[11px] text-gray-400 italic'>
								提示：保存前请确保 JSON 格式正确
							</div>
							<Button 
								variant='ghost' 
								onClick={() => setIsDialogOpen(false)}
								className='text-gray-500 hover:bg-gray-100'
							>
								取消
							</Button>
							<Button 
								onClick={handleSave}
								disabled={isLoading}
								className='bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]'
							>
								{isLoading ? '保存中...' : '保存配置'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}