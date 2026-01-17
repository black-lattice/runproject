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

	const topic = useMemo(
		() => (knowledgeIndex.topics || []).find(item => item.id === topicId),
		[topicId]
	);

	useEffect(() => {
		const loadContent = async () => {
			if (!topic?.file) {
				setContent('暂无内容，请检查文件是否存在。');
				return;
			}
			const loader = markdownModules[`/src/content/knowledge/${topic.file}`];
			if (!loader) {
				setContent('暂无内容，请检查文件是否存在。');
				return;
			}
			try {
				const text = await loader();
				setContent(text);
			} catch (error) {
				setContent('加载内容失败。');
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
			<div className='max-w-4xl mx-auto px-6 py-8'>
				<div className='flex items-center justify-between mb-6'>
					<Button variant='ghost' onClick={() => navigate('/knowledge')}>
						<ArrowLeft className='h-4 w-4 mr-2' />
						返回知识地图
					</Button>
					<div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500'>
						<BookOpen className='h-4 w-4' />
						{topic?.category || 'knowledge'}
					</div>
				</div>

				<div className='rounded-3xl border border-slate-200 bg-white p-6 shadow-sm'>
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
						<ReactMarkdown>{content}</ReactMarkdown>
					</div>
				</div>
			</div>
		</div>
	);
}

export default KnowledgeDetailPage;
