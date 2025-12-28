import { Card, CardContent } from '@/components/ui/card';
import { FolderPlus, MousePointerClick, Terminal, Zap } from 'lucide-react';

function WelcomeScreen() {
	return (
		<div className='h-full flex flex-col items-center justify-center p-8 bg-gray-50/50'>
			<div className='max-w-3xl w-full space-y-8 text-center'>
				<div className='space-y-4'>
					<div className='inline-flex items-center justify-center p-4 bg-blue-100 rounded-full text-blue-600 mb-4 ring-8 ring-blue-50'>
						<Terminal className='w-12 h-12' />
					</div>
					<h1 className='text-4xl font-extrabold text-gray-900 tracking-tight'>
						Node.js 项目工作台
					</h1>
					<p className='text-lg text-gray-500 max-w-2xl mx-auto'>
						高效管理您的 Node.js 项目，一键运行脚本，多版本环境切换。
					</p>
				</div>

				<div className='grid grid-cols-1 md:grid-cols-3 gap-6 text-left'>
					<Card className='border-none shadow-sm bg-white/60 hover:bg-white hover:shadow-md transition-all duration-300'>
						<CardContent className='p-6 space-y-3'>
							<div className='w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600'>
								<FolderPlus className='w-5 h-5' />
							</div>
							<h3 className='font-semibold text-gray-900'>添加工作区</h3>
							<p className='text-sm text-gray-500 leading-relaxed'>
								点击左上角的 "+" 号添加包含 Node.js 项目的文件夹。系统将自动扫描项目。
							</p>
						</CardContent>
					</Card>

					<Card className='border-none shadow-sm bg-white/60 hover:bg-white hover:shadow-md transition-all duration-300'>
						<CardContent className='p-6 space-y-3'>
							<div className='w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600'>
								<MousePointerClick className='w-5 h-5' />
							</div>
							<h3 className='font-semibold text-gray-900'>选择项目</h3>
							<p className='text-sm text-gray-500 leading-relaxed'>
								在侧边栏浏览您的项目列表。点击项目卡片即可查看详细脚本和配置信息。
							</p>
						</CardContent>
					</Card>

					<Card className='border-none shadow-sm bg-white/60 hover:bg-white hover:shadow-md transition-all duration-300'>
						<CardContent className='p-6 space-y-3'>
							<div className='w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600'>
								<Zap className='w-5 h-5' />
							</div>
							<h3 className='font-semibold text-gray-900'>一键运行</h3>
							<p className='text-sm text-gray-500 leading-relaxed'>
								点击脚本卡片上的 "Run" 按钮即可执行。支持多终端并发运行和日志查看。
							</p>
						</CardContent>
					</Card>
				</div>

				<div className='pt-8 text-sm text-gray-400'>
					<p>按下 <kbd className='px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs text-gray-600 font-mono'>Cmd/Ctrl + W</kbd> 快速添加新工作区</p>
				</div>
			</div>
		</div>
	);
}

export default WelcomeScreen;
