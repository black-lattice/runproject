import { useMemo, useState } from 'react';
import {
	BookOpen,
	Brain,
	Blocks,
	Binary,
	GitBranch,
	Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import knowledgeIndex from '@/content/knowledge/index.json';

const PATHS = [
	{
		title: 'Foundations',
		steps: ['Data Structures', 'Sorting & Searching', 'Big-O Basics']
	},
	{
		title: 'System Thinking',
		steps: ['Design Patterns', 'Concurrency Patterns', 'Architectural Styles']
	},
	{
		title: 'Practical Workflows',
		steps: ['Git Mastery', 'CLI Efficiency', 'Automation Habits']
	}
];

const CATEGORY_ICONS = {
	patterns: Blocks,
	'data-structures': Binary,
	algorithms: Brain,
	toolkits: Terminal
};

const CATEGORY_GRADIENTS = {
	patterns: 'from-amber-200 via-orange-100 to-rose-100',
	'data-structures': 'from-emerald-200 via-teal-100 to-cyan-100',
	algorithms: 'from-sky-200 via-indigo-100 to-blue-100',
	toolkits: 'from-stone-200 via-slate-100 to-zinc-100'
};

function KnowledgePage() {
	const [query, setQuery] = useState('');
	const [activeCategory, setActiveCategory] = useState('all');
	const navigate = useNavigate();

	const filteredTopics = useMemo(() => {
		const q = query.trim().toLowerCase();
		const topics = knowledgeIndex.topics || [];
		const categoryFiltered =
			activeCategory === 'all'
				? topics
				: topics.filter(item => item.category === activeCategory);

		if (!q) return categoryFiltered;
		return categoryFiltered.filter(item =>
			item.title.toLowerCase().includes(q)
		);
	}, [query, activeCategory]);

	const openFirstTopic = list => {
		const target = list?.[0];
		if (target) {
			navigate(`/knowledge/${target.id}`);
		}
	};

	return (
		<div
			className='h-full overflow-y-auto'
			style={{
				'--atlas-ink': '#0f172a',
				'--atlas-muted': '#6b7280',
				'--atlas-warm': '#fef3c7',
				'--atlas-bg': '#fffaf2'
			}}
		>
			<style>{`
				.knowledge-hero {
					background: radial-gradient(circle at 20% 20%, rgba(252, 211, 77, 0.25), transparent 55%),
						radial-gradient(circle at 80% 10%, rgba(56, 189, 248, 0.25), transparent 50%),
						linear-gradient(135deg, #fff8eb 0%, #f7f9ff 100%);
				}
				.paper-texture {
					background-image: radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px);
					background-size: 14px 14px;
				}
				@keyframes atlasFade {
					from { opacity: 0; transform: translateY(12px); }
					to { opacity: 1; transform: translateY(0); }
				}
				.atlas-reveal {
					animation: atlasFade 0.45s ease both;
				}
			`}</style>

			<div className='knowledge-hero border-b border-slate-200'>
				<div className='max-w-6xl mx-auto px-6 py-10 md:py-12'>
					<div className='flex flex-col gap-6 md:flex-row md:items-end md:justify-between'>
						<div>
							<div className='inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500'>
								<BookOpen className='h-4 w-4' />
								Knowledge Atlas
							</div>
							<h1
								className='mt-3 text-4xl md:text-5xl font-semibold text-slate-900'
								style={{
									fontFamily:
										'"Iowan Old Style","Palatino Linotype","Book Antiqua",serif'
								}}
							>
								从检索到理解，一站式学习导航台
							</h1>
							<p
								className='mt-3 text-base md:text-lg text-slate-600 max-w-2xl'
								style={{
									fontFamily:
										'"IBM Plex Sans Condensed","Helvetica Neue",sans-serif'
								}}
							>
								设计模式、数据结构、算法与工具速查集中在一起，建立可探索的知识地图。
							</p>
						</div>
						<div className='w-full md:w-[360px]'>
							<div className='rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur atlas-reveal'>
								<label className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
									快速检索
								</label>
								<Input
									className='mt-2 h-10'
									placeholder='搜索主题，如: Graph / Rust'
									value={query}
									onChange={event => setQuery(event.target.value)}
								/>
								<div className='mt-3 flex items-center gap-2 text-xs text-slate-500'>
									<span>热门:</span>
									<span className='rounded-full bg-amber-100 px-2 py-1'>#patterns</span>
									<span className='rounded-full bg-blue-100 px-2 py-1'>#algorithms</span>
								</div>
							</div>
						</div>
					</div>
					<div className='mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
						{(knowledgeIndex.categories || []).map((category, index) => {
							const Icon = CATEGORY_ICONS[category.id] || BookOpen;
							const isActive = activeCategory === category.id;
							return (
								<button
									key={category.id}
									type='button'
									className={`atlas-reveal text-left rounded-2xl p-4 border shadow-sm bg-gradient-to-br transition ${
										CATEGORY_GRADIENTS[category.id] || 'from-slate-100'
									} ${
										isActive
											? 'border-slate-900/60 ring-2 ring-slate-900/20'
											: 'border-white/60 hover:border-slate-900/40'
									}`}
									style={{ animationDelay: `${index * 80}ms` }}
									onClick={() => {
										setActiveCategory(
											isActive ? 'all' : category.id
										);
										setQuery('');
									}}
								>
									<div className='flex items-start justify-between'>
										<Icon className='h-6 w-6 text-slate-800' />
										<span className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>
											专题
										</span>
									</div>
									<h3
										className='mt-4 text-lg font-semibold text-slate-900'
										style={{
											fontFamily:
												'"Iowan Old Style","Palatino Linotype","Book Antiqua",serif'
										}}
									>
										{category.title}
									</h3>
									<p className='mt-2 text-sm text-slate-600'>
										{category.description}
									</p>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<div className='max-w-6xl mx-auto px-6 py-10 grid gap-8 lg:grid-cols-[2fr_1fr]'>
				<section className='space-y-6'>
					<div className='flex items-center justify-between'>
						<h2
							className='text-2xl font-semibold text-slate-900'
							style={{
								fontFamily:
									'"Iowan Old Style","Palatino Linotype","Book Antiqua",serif'
							}}
						>
							知识速查
						</h2>
						<Button
							variant='outline'
							className='h-9'
							onClick={() => openFirstTopic(filteredTopics)}
						>
							进入专题
						</Button>
					</div>
					<div className='paper-texture rounded-3xl border border-slate-200 bg-white p-6'>
						<div className='grid gap-3 sm:grid-cols-2'>
							{filteredTopics.map(topic => {
								return (
									<button
										key={topic.id}
										type='button'
										className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-sm transition ${
											'border-slate-200 bg-white/80 hover:border-blue-200'
										}`}
										onClick={() => navigate(`/knowledge/${topic.id}`)}
									>
										<div>
											<p className='text-sm font-semibold text-slate-800'>
												{topic.title}
											</p>
											<p className='mt-1 text-xs uppercase tracking-[0.2em] text-slate-400'>
												{topic.tags?.[0] || ''}
											</p>
										</div>
										<span className='text-xs font-semibold uppercase tracking-[0.2em] text-slate-500'>
											打开
										</span>
									</button>
								);
							})}
						</div>
						{filteredTopics.length === 0 && (
							<div className='text-center text-sm text-slate-500 py-6'>
								暂无匹配内容
							</div>
						)}
					</div>
				</section>

				<aside className='space-y-6'>
					<div className='rounded-3xl border border-slate-200 bg-white p-6 shadow-sm'>
						<div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500'>
							<GitBranch className='h-4 w-4' />
							Learning Paths
						</div>
						<div className='mt-4 space-y-4'>
							{PATHS.map(path => (
								<div key={path.title} className='space-y-2'>
									<h3 className='text-sm font-semibold text-slate-900'>
										{path.title}
									</h3>
									<div className='flex flex-wrap gap-2'>
										{path.steps.map(step => (
											<button
												key={step}
												type='button'
												className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-900'
												onClick={() => setQuery(step)}
											>
												{step}
											</button>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className='rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-lg'>
						<p className='text-xs uppercase tracking-[0.28em] text-slate-300'>
							Focus Session
						</p>
						<h3
							className='mt-3 text-2xl font-semibold'
							style={{
								fontFamily:
									'"Iowan Old Style","Palatino Linotype","Book Antiqua",serif'
							}}
						>
							今日主题：图论基础
						</h3>
						<p className='mt-2 text-sm text-slate-300'>
							从 BFS/DFS 开始，再到最短路径与拓扑排序。
						</p>
						<Button className='mt-4 w-full bg-white text-slate-900 hover:bg-slate-100'>
							开始学习
						</Button>
					</div>
				</aside>
			</div>
		</div>
	);
}

export default KnowledgePage;
