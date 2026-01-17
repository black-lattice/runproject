import {
	createContext,
	useContext,
	useRef,
	useEffect,
	useLayoutEffect,
	useState
} from 'react';
import { createPortal } from 'react-dom';

const PopoverContext = createContext(null);

export function Popover({ open, onOpenChange, children }) {
	const anchorRef = useRef(null);
	const contentRef = useRef(null);

	useEffect(() => {
		if (!open) return;

		const handleClickOutside = event => {
			if (
				contentRef.current &&
				!contentRef.current.contains(event.target) &&
				anchorRef.current &&
				!anchorRef.current.contains(event.target)
			) {
				onOpenChange?.(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [open, onOpenChange, anchorRef]);

	return (
		<PopoverContext.Provider
			value={{ open, onOpenChange, anchorRef, contentRef }}
		>
			<span className='relative inline-flex'>{children}</span>
		</PopoverContext.Provider>
	);
}

export function PopoverTrigger({ children, className = '' }) {
	const ctx = useContext(PopoverContext);

	return (
		<span
			ref={ctx.anchorRef}
			className={`inline-flex ${className}`}
			onClick={() => ctx.onOpenChange?.(!ctx.open)}
		>
			{children}
		</span>
	);
}

export function PopoverContent({ children, className = '' }) {
	const ctx = useContext(PopoverContext);
	if (!ctx?.open) return null;

	const [style, setStyle] = useState({
		position: 'fixed',
		top: 0,
		left: 0,
		zIndex: 9999,
		visibility: 'hidden'
	});

	useLayoutEffect(() => {
		if (!ctx?.open) return;

		let rafId = null;

		const updatePosition = () => {
			const anchor = ctx.anchorRef?.current;
			const content = ctx.contentRef?.current;
			if (!anchor || !content) {
				rafId = requestAnimationFrame(updatePosition);
				return;
			}

			const rect = anchor.getBoundingClientRect();
			const contentRect = content.getBoundingClientRect();
			const padding = 8;

			let left = rect.left;
			if (left + contentRect.width + padding > window.innerWidth) {
				left = window.innerWidth - contentRect.width - padding;
			}
			if (left < padding) left = padding;

			let top = rect.bottom + padding;
			if (top + contentRect.height + padding > window.innerHeight) {
				top = rect.top - contentRect.height - padding;
			}
			if (top < padding) top = padding;

			setStyle({
				position: 'fixed',
				top: `${top}px`,
				left: `${left}px`,
				zIndex: 9999,
				visibility: 'visible'
			});
		};

		rafId = requestAnimationFrame(updatePosition);
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);

		return () => {
			if (rafId) cancelAnimationFrame(rafId);
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [ctx?.open, ctx?.anchorRef, ctx?.contentRef]);

	return createPortal(
		<div
			ref={ctx.contentRef}
			style={style}
			className={`min-w-64 rounded-lg border bg-white shadow-lg p-3 ${className}`}
		>
			{children}
		</div>,
		document.body
	);
}
