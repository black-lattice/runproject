import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, Import, Repeat, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
	getCodexAccountList,
	importCurrentCodexAccount,
	switchCodexAccount,
	syncCurrentCodexAccount
} from '@/services/codex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';

const formatTs = ts => {
	if (!ts) return '未知';
	return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
};

const formatPercent = windowInfo => {
	if (!windowInfo) return '未知';
	return `${windowInfo.remainingPercent}%`;
};

export function CodexAccountSettings() {
	const { toast } = useToast();
	const [accountName, setAccountName] = useState('');
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [data, setData] = useState({
		currentGlobal: null,
		currentProfileName: null,
		profiles: []
	});

	const currentLabel = useMemo(() => {
		const current = data.currentGlobal;
		if (!current) return '未检测到当前全局 Codex 登录';
		return current.email || current.accountId || '已登录，但无法识别邮箱';
	}, [data.currentGlobal]);

	const loadAccounts = async () => {
		setLoading(true);
		setError('');
		try {
			const result = await getCodexAccountList();
			setData({
				currentGlobal: result.currentGlobal || null,
				currentProfileName: result.currentProfileName || null,
				profiles: result.profiles || []
			});
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadAccounts();
	}, []);

	const handleImport = async () => {
		setSubmitting(true);
		setError('');
		try {
			const profile = await importCurrentCodexAccount({
				name: accountName.trim() || null
			});
			await loadAccounts();
			setAccountName(profile.name);
			toast({
				title: '导入成功',
				description: `账号 ${profile.name} 已保存到工具内。`
			});
		} catch (err) {
			setError(String(err));
			toast({
				title: '导入失败',
				description: String(err),
				variant: 'destructive'
			});
		} finally {
			setSubmitting(false);
		}
	};

	const handleSwitch = async profileName => {
		setSubmitting(true);
		setError('');
		try {
			await switchCodexAccount({ profileName });
			await loadAccounts();
			toast({
				title: '切换成功',
				description: `本机 Codex 已切换到账号 ${profileName}。`
			});
		} catch (err) {
			setError(String(err));
			toast({
				title: '切换失败',
				description: String(err),
				variant: 'destructive'
			});
		} finally {
			setSubmitting(false);
		}
	};

	const handleSync = async profileName => {
		setSubmitting(true);
		setError('');
		try {
			await syncCurrentCodexAccount({ profileName });
			await loadAccounts();
			toast({
				title: '同步成功',
				description: `已用当前全局 Codex 登录信息刷新 ${profileName}。`
			});
		} catch (err) {
			setError(String(err));
			toast({
				title: '同步失败',
				description: String(err),
				variant: 'destructive'
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className='space-y-6'>
			<Card className='shadow-sm border-gray-200'>
				<CardHeader className='pb-4'>
					<div className='flex items-start justify-between gap-4'>
						<div>
							<CardTitle className='text-xl'>Codex 账号切换</CardTitle>
							<CardDescription className='mt-1'>
								这个面板直接管理本机 <code>~/.codex/auth.json</code>，
								切换后你终端里的原生 <code>codex</code> 命令会立刻使用新的账号。
							</CardDescription>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={loadAccounts}
							disabled={loading || submitting}
						>
							<RefreshCw
								className={`w-4 h-4 mr-2 ${
									loading ? 'animate-spin' : ''
								}`}
							/>
							刷新
						</Button>
					</div>
				</CardHeader>
				<CardContent className='space-y-4'>
					<Alert>
						<AlertCircle className='h-4 w-4' />
						<AlertTitle>使用方式</AlertTitle>
						<AlertDescription>
							先在终端用官方 <code>codex login</code> 登录目标账号，再点“导入当前账号快照”。
							切换时工具只回写本机当前的认证文件，不接管你项目里的 Codex 会话逻辑。
						</AlertDescription>
					</Alert>

					<div className='rounded-xl border border-gray-200 bg-gray-50/70 p-4'>
						<div className='flex flex-wrap items-center gap-3'>
							<Badge variant='secondary'>当前本机账号</Badge>
							<span className='text-sm font-medium text-gray-900'>
								{currentLabel}
							</span>
							{data.currentGlobal?.planType && (
								<Badge variant='outline'>
									套餐: {data.currentGlobal.planType}
								</Badge>
							)}
							{data.currentProfileName && (
								<Badge className='bg-emerald-600 hover:bg-emerald-600'>
									已纳入管理: {data.currentProfileName}
								</Badge>
							)}
						</div>
					</div>

					<div className='flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 md:flex-row md:items-center'>
						<Input
							value={accountName}
							onChange={event => setAccountName(event.target.value)}
							placeholder='可选：给当前账号起一个别名'
							className='md:max-w-sm'
						/>
						<Button
							onClick={handleImport}
							disabled={submitting}
							className='gap-2 bg-emerald-600 hover:bg-emerald-700'
						>
							<Import className='w-4 h-4' />
							导入当前账号快照
						</Button>
					</div>

					{error && (
						<Alert variant='destructive'>
							<AlertCircle className='h-4 w-4' />
							<AlertTitle>操作失败</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>

			<Card className='shadow-sm border-gray-200'>
				<CardHeader className='pb-4'>
					<CardTitle className='text-xl'>已管理账号</CardTitle>
					<CardDescription>
						切换会直接影响本机终端里的 <code>codex</code> 登录账号。
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='rounded-lg border border-gray-100 overflow-hidden'>
						<Table>
							<TableHeader className='bg-gray-50/50'>
								<TableRow>
									<TableHead>账号</TableHead>
									<TableHead>套餐</TableHead>
									<TableHead>5h 剩余</TableHead>
									<TableHead>周剩余</TableHead>
									<TableHead>最近同步</TableHead>
									<TableHead className='text-right'>操作</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{!loading && data.profiles.length === 0 && (
									<TableRow>
										<TableCell colSpan={6} className='py-12 text-center text-gray-400'>
											<div className='flex flex-col items-center gap-2'>
												<Users className='w-8 h-8 opacity-20' />
												<p>还没有导入任何 Codex 账号</p>
											</div>
										</TableCell>
									</TableRow>
								)}
								{data.profiles.map(profile => (
									<TableRow key={profile.name}>
										<TableCell>
											<div className='flex flex-col gap-1'>
												<div className='flex items-center gap-2'>
													<span className='font-medium text-gray-900'>
														{profile.name}
													</span>
													{profile.isActive && (
														<Badge className='bg-emerald-600 hover:bg-emerald-600'>
															当前
														</Badge>
													)}
												</div>
												<span className='text-xs text-gray-500'>
													{profile.meta?.email || '未知邮箱'}
												</span>
											</div>
										</TableCell>
										<TableCell className='text-sm text-gray-600'>
											{profile.meta?.planType || '未知'}
										</TableCell>
										<TableCell className='text-sm text-gray-600'>
											{formatPercent(profile.status?.primary)}
										</TableCell>
										<TableCell className='text-sm text-gray-600'>
											{formatPercent(profile.status?.secondary)}
										</TableCell>
										<TableCell className='text-xs text-gray-500'>
											<div>{formatTs(profile.updatedAt)}</div>
											<div>
												5h 重置: {formatTs(profile.status?.primary?.resetsAt)}
											</div>
										</TableCell>
										<TableCell>
											<div className='flex justify-end gap-2'>
												<Button
													variant='outline'
													size='sm'
													onClick={() => handleSync(profile.name)}
													disabled={submitting}
												>
													<Repeat className='w-4 h-4 mr-1.5' />
													同步当前登录
												</Button>
												<Button
													size='sm'
													onClick={() => handleSwitch(profile.name)}
													disabled={submitting || profile.isActive}
													className='bg-emerald-600 hover:bg-emerald-700'
												>
													切换到本机 Codex
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default CodexAccountSettings;
