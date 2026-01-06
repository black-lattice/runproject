import { useEffect, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const SEARCH_ENGINE = 'https://www.bing.com/search?q=';

function URLInput({
	url,
	onUrlChange,
	favoriteDefaultTitle,
	onFavoriteSubmit
}) {
	const [inputValue, setInputValue] = useState(url || '');

	useEffect(() => {
		setInputValue(url || '');
	}, [url]);

	const isValidUrl = input => {
		if (!input) return false;

		const localhostPattern =
			/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i;
		const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/;

		if (localhostPattern.test(input) || ipPattern.test(input)) {
			return true;
		}

		if (input.startsWith('http://') || input.startsWith('https://')) {
			return true;
		}

		const domainPattern =
			/^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/;
		return domainPattern.test(input);
	};

	const handleSubmit = e => {
		e.preventDefault();
		const trimmedInput = inputValue.trim();

		if (trimmedInput) {
			let finalUrl = trimmedInput;

			if (!isValidUrl(trimmedInput)) {
				finalUrl = `${SEARCH_ENGINE}${encodeURIComponent(trimmedInput)}`;
			} else if (
				!trimmedInput.startsWith('http://') &&
				!trimmedInput.startsWith('https://')
			) {
				finalUrl = `http://${trimmedInput}`;
			}

			setInputValue(finalUrl);
			onUrlChange(finalUrl);
		}
	};

	return (
		<form
			onSubmit={handleSubmit}
			className='flex items-center p-1 bg-white border-b'
		>
			<div className='relative flex-1'>
				<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
				<div className='absolute right-2 top-1/2 -translate-y-1/2'>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						className='h-8 w-8 p-0 text-gray-500'
						disabled={!url}
						onClick={() => {
							const title = (favoriteDefaultTitle || '').trim();
							onFavoriteSubmit?.(title || url);
						}}
					>
						<Star className='h-4 w-4' />
					</Button>
				</div>
				<Input
					type='text'
					placeholder='输入 URL 或搜索关键词，按 Enter 搜索'
					value={inputValue}
					onChange={e => setInputValue(e.target.value)}
					className='pl-10 pr-10'
				/>
			</div>
		</form>
	);
}

export default URLInput;
