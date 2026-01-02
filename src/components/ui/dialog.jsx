import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const DialogContext = createContext(null);

export function Dialog({ open, onOpenChange, children }) {
	return (
		<DialogContext.Provider value={{ open, onOpenChange }}>
			{children}
		</DialogContext.Provider>
	);
}

export function DialogContent({ children, className = '' }) {
	const ctx = useContext(DialogContext);
	if (!ctx?.open) return null;

	return createPortal(
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
			<div
				className={`bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden ${className}`}>
				{children}
			</div>
		</div>,
		document.body
	);
}

export function DialogHeader({ children, className = '' }) {
	return <div className={`p-4 border-b ${className}`}>{children}</div>;
}

export function DialogTitle({ children, className = '' }) {
	return <div className={`text-base font-semibold ${className}`}>{children}</div>;
}

export function DialogFooter({ children, className = '' }) {
	return <div className={`p-4 border-t flex justify-end gap-2 ${className}`}>{children}</div>;
}

export function DialogClose({ children, className = '' }) {
	const ctx = useContext(DialogContext);
	return (
		<button
			type='button'
			className={className}
			onClick={() => ctx?.onOpenChange?.(false)}>
			{children}
		</button>
	);
}


