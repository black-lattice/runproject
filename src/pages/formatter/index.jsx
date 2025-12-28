import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import {
	Copy,
	Trash2,
	AlertCircle,
	CheckCircle2,
	Download,
	Upload,
	Lightbulb,
	Play
} from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginHtml from 'prettier/plugins/html';
import * as prettierPluginCss from 'prettier/plugins/postcss';
import * as prettierPluginMarkdown from 'prettier/plugins/markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

const FORMATTERS = {
	json: {
		name: 'JSON',
		extensions: ['.json'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'json',
				plugins: [prettierPluginBabel, prettierPluginEstree],
				tabWidth: 2,
				semi: true,
				singleQuote: false
			});
		},
		compress: text => {
			const parsed = JSON.parse(text);
			return JSON.stringify(parsed);
		}
	},
	javascript: {
		name: 'JavaScript',
		extensions: ['.js', '.jsx'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'babel',
				plugins: [prettierPluginBabel, prettierPluginEstree],
				tabWidth: 2,
				semi: true,
				singleQuote: true
			});
		}
	},
	typescript: {
		name: 'TypeScript',
		extensions: ['.ts', '.tsx'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'babel-ts',
				plugins: [prettierPluginBabel, prettierPluginEstree],
				tabWidth: 2,
				semi: true,
				singleQuote: true
			});
		}
	},
	css: {
		name: 'CSS',
		extensions: ['.css', '.scss', '.less'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'css',
				plugins: [prettierPluginCss],
				tabWidth: 2
			});
		}
	},
	html: {
		name: 'HTML',
		extensions: ['.html', '.htm'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'html',
				plugins: [prettierPluginHtml],
				tabWidth: 2,
				htmlWhitespaceSensitivity: 'css'
			});
		}
	},
	xml: {
		name: 'XML',
		extensions: ['.xml', '.svg'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'html',
				plugins: [prettierPluginHtml],
				tabWidth: 2
			});
		}
	},
	sql: {
		name: 'SQL',
		extensions: ['.sql'],
		usePrettier: false,
		format: text => {
			return text
				.replace(/\bSELECT\b/gi, '\nSELECT\n  ')
				.replace(/\bFROM\b/gi, '\nFROM\n  ')
				.replace(/\bWHERE\b/gi, '\nWHERE\n  ')
				.replace(/\bAND\b/gi, '\n  AND ')
				.replace(/\bOR\b/gi, '\n  OR ')
				.replace(/\bJOIN\b/gi, '\nJOIN\n  ')
				.replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN\n  ')
				.replace(/\bINNER JOIN\b/gi, '\nINNER JOIN\n  ')
				.replace(/\bORDER BY\b/gi, '\nORDER BY\n  ')
				.replace(/\bGROUP BY\b/gi, '\nGROUP BY\n  ')
				.trim();
		}
	},
	markdown: {
		name: 'Markdown',
		extensions: ['.md', '.markdown'],
		usePrettier: true,
		format: async text => {
			return await prettier.format(text, {
				parser: 'markdown',
				plugins: [prettierPluginMarkdown],
				proseWrap: 'preserve'
			});
		}
	}
};

function FormatterPage() {
	const [inputText, setInputText] = useState('');
	const [outputText, setOutputText] = useState('');
	const [selectedFormat, setSelectedFormat] = useState('json');
	const [error, setError] = useState('');
	const [isCompressed, setIsCompressed] = useState(false);
	const [leftWidth, setLeftWidth] = useState(50);
	const [isDragging, setIsDragging] = useState(false);
	const { toast } = useToast();

	const handleMouseMove = e => {
		if (!isDragging) return;
		const newWidth = (e.clientX / window.innerWidth) * 100;
		if (newWidth > 10 && newWidth < 90) {
			setLeftWidth(newWidth);
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseDown = e => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleFormat = async () => {
		setError('');

		if (!inputText.trim()) {
			setError('请输入要格式化的内容');
			return;
		}

		try {
			const formatter = FORMATTERS[selectedFormat];

			if (isCompressed && formatter.compress) {
				const compressed = formatter.compress(inputText);
				setOutputText(compressed);
			} else {
				const formatted = await formatter.format(inputText);
				console.log('格式化结果:', formatted);
				console.log('包含换行符:', formatted.includes('\n'));
				console.log(
					'换行符数量:',
					(formatted.match(/\n/g) || []).length
				);
				setOutputText(formatted);
			}

			toast({
				description: (
					<div className='flex items-center gap-2'>
						<CheckCircle2 className='h-4 w-4 text-green-500' />
						<span>格式化成功</span>
					</div>
				)
			});
		} catch (err) {
			setError(`格式化失败: ${err.message}`);
			setOutputText('');
			toast({
				variant: 'destructive',
				description: (
					<div className='flex items-center gap-2'>
						<AlertCircle className='h-4 w-4' />
						<span>格式化失败</span>
					</div>
				)
			});
		}
	};

	const handleCopy = async () => {
		if (!outputText) return;

		try {
			await navigator.clipboard.writeText(outputText);
			toast({
				description: (
					<div className='flex items-center gap-2'>
						<CheckCircle2 className='h-4 w-4 text-green-500' />
						<span>已复制到剪贴板</span>
					</div>
				)
			});
		} catch (err) {
			toast({
				variant: 'destructive',
				description: '复制失败'
			});
		}
	};

	const handleClear = () => {
		setInputText('');
		setOutputText('');
		setError('');
	};

	const handleFileUpload = e => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = event => {
			const content = event.target?.result;
			if (typeof content === 'string') {
				setInputText(content);

				const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
				for (const [key, formatter] of Object.entries(FORMATTERS)) {
					if (formatter.extensions?.includes(ext)) {
						setSelectedFormat(key);
						break;
					}
				}
			}
		};
		reader.readAsText(file);
	};

	const handleDownload = () => {
		if (!outputText) return;

		const formatter = FORMATTERS[selectedFormat];
		const ext = formatter.extensions?.[0] || '.txt';
		const blob = new Blob([outputText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `formatted${ext}`;
		a.click();
		URL.revokeObjectURL(url);

		toast({
			description: (
				<div className='flex items-center gap-2'>
					<CheckCircle2 className='h-4 w-4 text-green-500' />
					<span>文件已下载</span>
				</div>
			)
		});
	};

	return (
		<div
			className='h-full flex flex-col bg-gray-50'
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}>
			{error && (
				<div className='m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2'>
					<AlertCircle className='h-5 w-5 text-red-500 flex-shrink-0 mt-0.5' />
					<div className='flex-1'>
						<p className='text-sm font-medium text-red-800'>
							格式化错误
						</p>
						<p className='text-sm text-red-600 mt-1'>{error}</p>
					</div>
				</div>
			)}

			<div className='flex-1 flex overflow-hidden border-t relative'>
				<Card
					className='flex flex-col overflow-hidden rounded-none border-y-0 border-l-0 shadow-none'
					style={{ width: `${leftWidth}%` }}>
					<div className='flex items-center justify-between px-4 py-2 border-b bg-gray-50'>
						<div className='flex items-center gap-3'>
							<Select
								value={selectedFormat}
								onValueChange={setSelectedFormat}>
								<SelectTrigger className='h-8 w-[130px] bg-white'>
									<SelectValue placeholder='选择格式' />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(FORMATTERS).map(
										([key, formatter]) => (
											<SelectItem
												key={key}
												value={key}>
												{formatter.name}
											</SelectItem>
										)
									)}
								</SelectContent>
							</Select>
							<Button
								onClick={handleFormat}
								size='sm'
								className='h-8 bg-blue-600 hover:bg-blue-700'>
								<Play className='h-3.5 w-3.5 mr-1.5' />
								Format
							</Button>
						</div>
						<div className='flex gap-1'>
							<label>
								<input
									type='file'
									className='hidden'
									onChange={handleFileUpload}
									accept='.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.sql,.md,.markdown'
								/>
								<Button
									variant='ghost'
									size='sm'
									className='h-8 text-gray-600 hover:text-blue-600 px-2'
									onClick={e => {
										e.preventDefault();
										e.currentTarget.parentElement
											?.querySelector('input')
											?.click();
									}}>
									<Upload className='h-4 w-4 mr-1' />
									导入
								</Button>
							</label>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleClear}
								className='h-8 text-gray-600 hover:text-red-600 px-2'>
								<Trash2 className='h-4 w-4 mr-1' />
								清空
							</Button>
						</div>
					</div>
					<div className='flex-1 overflow-hidden'>
						<textarea
							value={inputText}
							onChange={e => setInputText(e.target.value)}
							placeholder={`粘贴你的 ${FORMATTERS[selectedFormat].name} 数据...`}
							className='w-full h-full p-4 font-mono text-sm resize-none focus:outline-none bg-white'
							spellCheck={false}
						/>
					</div>
				</Card>

				<div
					className={`absolute z-10 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors ${isDragging ? 'bg-blue-600' : 'bg-transparent'}`}
					style={{
						left: `${leftWidth}%`,
						transform: 'translateX(-50%)'
					}}
					onMouseDown={handleMouseDown}
				/>

				<Card
					className='flex flex-col overflow-hidden rounded-none border-y-0 border-r-0 shadow-none border-l'
					style={{ width: `${100 - leftWidth}%` }}>
					<div className='flex items-center justify-between px-4 py-2 border-b bg-gray-50'>
						<span className='text-sm font-semibold text-gray-700'>
							输出
						</span>
						<div className='flex gap-1'>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleDownload}
								disabled={!outputText}
								className='h-8 text-gray-600 hover:text-green-600 px-2'>
								<Download className='h-4 w-4 mr-1' />
								下载
							</Button>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleCopy}
								disabled={!outputText}
								className='h-8 text-gray-600 hover:text-blue-600 px-2'>
								<Copy className='h-4 w-4 mr-1' />
								复制
							</Button>
						</div>
					</div>
					<div className='flex-1 overflow-auto bg-white'>
						{outputText ? (
							<SyntaxHighlighter
								language={selectedFormat}
								style={oneLight}
								customStyle={{
									margin: 0,
									padding: '1rem',
									fontSize: '0.875rem',
									lineHeight: '1.25rem',
									backgroundColor: 'transparent'
								}}
								showLineNumbers={true}
								lineNumberStyle={{
									minWidth: '3em',
									paddingRight: '1em',
									color: '#ccc'
								}}>
								{outputText}
							</SyntaxHighlighter>
						) : (
							<div className='p-4 text-gray-400 text-sm'>
								格式化结果将显示在这里...
							</div>
						)}
					</div>
				</Card>
			</div>

			<Toaster />
		</div>
	);
}

export default FormatterPage;
