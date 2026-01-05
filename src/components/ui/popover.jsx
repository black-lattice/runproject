import { createContext, useContext, useRef, useEffect } from 'react';

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

	return (
		<div
			ref={ctx.contentRef}
			className={`absolute right-0 top-full mt-2 z-50 min-w-64 rounded-lg border bg-white shadow-lg p-3 ${className}`}
		>
			{children}
		</div>
	);
}
