import { createContext, useContext, useRef } from 'react';

const PopoverContext = createContext(null);

export function Popover({ open, onOpenChange, children }) {
    const anchorRef = useRef(null);
    return (
        <PopoverContext.Provider value={{ open, onOpenChange, anchorRef }}>
            <span className='relative inline-flex'>{children}</span>
        </PopoverContext.Provider>
    );
}

export function PopoverTrigger({ children, className = '' }) {
    const ctx = useContext(PopoverContext);
    return (
        <span ref={ctx.anchorRef} className={`inline-flex ${className}`}>
            {children}
        </span>
    );
}

export function PopoverContent({ children, className = '' }) {
    const ctx = useContext(PopoverContext);
    if (!ctx?.open) return null;

    return (
        <div
            className={`absolute right-0 top-full mt-2 z-50 min-w-64 rounded-lg border bg-white shadow-lg p-3 ${className}`}>
            {children}
        </div>
    );
}


