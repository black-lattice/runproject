import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import knowledgeIndex from '@/content/knowledge/index.json';
import { Button } from '@/components/ui/button';

const markdownModules = import.meta.glob('/src/content/knowledge/*.md', {
	as: 'raw'
});

function KnowledgeDetailPage() {
	const { topicId } = useParams();
	const navigate = useNavigate();
	const [content, setContent] = useState('');
	const [outline, setOutline] = useState([]);

	const topic = useMemo(
		() => (knowledgeIndex.topics || []).find(item => item.id === topicId),
		[topicId]
	);

	const slugify = text =>
		text
			.toLowerCase()
			.replace(/[^\w\u4e00-\u9fff\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-');

	const extractText = node => {
		if (node == null) return '';
		if (typeof node === 'string' || typeof node === 'number') {
			return String(node);
		}
		if (Array.isArray(node)) {
			return node.map(extractText).join('');
		}
		if (typeof node === 'object' && node.props?.children) {
			return extractText(node.props.children);
		}
		return '';
	};

	useEffect(() => {
		const loadContent = async () => {
			if (!topic?.file) {
				setContent('暂无内容，请检查文件是否存在。');
				setOutline([]);
				return;
			}
			const loader = markdownModules[`/src/content/knowledge/${topic.file}`];
			if (!loader) {
				setContent('暂无内容，请检查文件是否存在。');
				setOutline([]);
				return;
			}
			try {
				const text = await loader();
				setContent(text);
				const lines = text.split('\n');
				const seen = new Map();
				const headings = lines
					.filter(line => /^#{1,3}\s+/.test(line))
					.map(line => {
						const level = line.match(/^#+/)[0].length;
						const title = line.replace(/^#{1,3}\s+/, '').trim();
						const base = slugify(title);
						const count = (seen.get(base) || 0) + 1;
						seen.set(base, count);
						const id = count > 1 ? `${base}-${count}` : base;
						return { level, title, id };
					});
				setOutline(headings);
			} catch (error) {
				setContent('加载内容失败。');
				setOutline([]);
			}
		};

		loadContent();
	}, [topic?.file]);

	return (
		<div className='h-full overflow-y-auto knowledge-dots'>
			<style>{`
				.knowledge-dots {
					background-image: radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px);
					background-size: 14px 14px;
				}
			`}</style>
			<div className='max-w-6xl mx-auto px-6 py-8 relative'>
				<div className='flex items-center justify-between'>
					<Button variant='ghost' onClick={() => navigate('/knowledge')}>
						<ArrowLeft className='h-4 w-4 mr-2' />
						返回知识地图
					</Button>
					<div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500'>
						<BookOpen className='h-4 w-4' />
						{topic?.category || 'knowledge'}
					</div>
				</div>

				<aside className='hidden lg:block fixed left-6 top-24 w-44'>
					<p className='text-xs uppercase tracking-[0.2em] text-slate-500'>
						大纲
					</p>
					<div className='mt-4 flex flex-col gap-2 text-sm text-slate-600'>
						{outline.length === 0 ? (
							<p className='text-xs text-slate-400'>暂无目录</p>
						) : (
							outline.map((item, index) => (
								<button
									key={`${item.id}-${index}`}
									type='button'
									className='block w-full text-left hover:text-slate-900 transition-colors'
									style={{ marginLeft: `${(item.level - 1) * 12}px` }}
									onClick={() => {
										const el =
											document.getElementById(item.id) ||
											Array.from(
												document.querySelectorAll('h1, h2, h3')
											).find(
												node =>
													node.textContent?.trim() === item.title
											);
										if (!el) return;
										el.scrollIntoView({
											behavior: 'smooth',
											block: 'start'
										});
									}}
								>
									{item.title}
								</button>
							))
						)}
					</div>
				</aside>

				<div className='rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mt-6 mx-auto max-w-4xl'>
					<h1
						className='text-3xl font-semibold text-slate-900'
						style={{
							fontFamily:
								'"Iowan Old Style","Palatino Linotype","Book Antiqua",serif'
						}}
					>
						{topic?.title || '内容'}
					</h1>
					<div className='mt-4 knowledge-md'>
						{(() => {
							const idPool = outline.reduce((acc, item) => {
								if (!acc[item.title]) acc[item.title] = [];
								acc[item.title].push(item.id);
								return acc;
							}, {});
							const idIndex = {};

							const getIdForTitle = title => {
								const list = idPool[title] || [];
								const index = idIndex[title] || 0;
								idIndex[title] = index + 1;
								return list[index] || slugify(title);
							};

							const Heading = tag => ({ node, ...props }) => {
								const title = extractText(props.children);
								const id = getIdForTitle(title);
								const Tag = tag;
								return <Tag id={id} {...props} />;
							};

							return (
								<ReactMarkdown
									components={{
										h1: Heading('h1'),
										h2: Heading('h2'),
										h3: Heading('h3')
									}}
								>
									{content}
								</ReactMarkdown>
							);
						})()}
					</div>
				</div>
			</div>
		</div>
	);
}

export default KnowledgeDetailPage;
