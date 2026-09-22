import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronUp, Terminal } from 'lucide-react';
import { useTerminalSessionState } from '@/hooks/useTerminalSessions';
import { clampTerminalHeight, DEFAULT_TERMINAL_HEIGHT, terminalHeightBounds, useTerminalPanelStore } from '@/store/useTerminalPanelStore';
import TerminalWorkspace from './TerminalWorkspace';

export default function ProjectTerminalDock({ project }) {
  const { visible, height, show, hide, setHeight } = useTerminalPanelStore();
  const { terminals } = useTerminalSessionState();
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const previousCount = useRef(terminals.length);
  const [mounted, setMounted] = useState(visible);
  const [containerHeight, setContainerHeight] = useState(600);
  const [dragHeight, setDragHeight] = useState(null);
  const bounds = terminalHeightBounds(containerHeight);
  const displayedHeight = clampTerminalHeight(dragHeight ?? height, containerHeight);

  useLayoutEffect(() => {
    const container = rootRef.current?.parentElement;
    if (!container) return;
    const measure = () => setContainerHeight(container.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (previousCount.current > 0 && terminals.length === 0) hide();
    previousCount.current = terminals.length;
  }, [terminals.length, hide]);

  const finishDrag = event => {
    if (dragRef.current?.id !== event.pointerId) return;
    setHeight(clampTerminalHeight(dragRef.current.height - (event.clientY - dragRef.current.y), containerHeight));
    dragRef.current = null;
    setDragHeight(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section ref={rootRef} className="relative z-30 shrink-0 border-t border-border bg-background" aria-label="项目终端">
      {!visible && <button type="button" onClick={show} aria-expanded={false} aria-controls="project-terminal-panel"
        className="flex h-8 w-full items-center gap-2 px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <Terminal className="h-3.5 w-3.5" />终端
        {terminals.length > 0 && <span>{terminals.length} 个会话</span>}
        <ChevronUp className="ml-auto h-3.5 w-3.5" />
      </button>}
      <div id="project-terminal-panel" hidden={!visible} style={{ height: displayedHeight }}>
        <div role="separator" aria-label="调整终端高度" aria-orientation="horizontal" aria-valuemin={bounds.min}
          aria-valuemax={bounds.max} aria-valuenow={displayedHeight} aria-controls="project-terminal-panel" tabIndex={0}
          className="absolute -top-1 left-0 z-40 h-2 w-full cursor-row-resize touch-none hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-none"
          title="拖拽调整高度，双击恢复默认高度；方向键可微调"
          onDoubleClick={() => setHeight(clampTerminalHeight(DEFAULT_TERMINAL_HEIGHT, containerHeight))}
          onKeyDown={event => {
            const next = { ArrowUp: displayedHeight + 24, ArrowDown: displayedHeight - 24, Home: bounds.min, End: bounds.max }[event.key];
            if (next == null) return;
            event.preventDefault();
            setHeight(clampTerminalHeight(next, containerHeight));
          }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { id: event.pointerId, y: event.clientY, height: displayedHeight };
          }}
          onPointerMove={event => {
            const drag = dragRef.current;
            if (drag?.id !== event.pointerId) return;
            setDragHeight(clampTerminalHeight(drag.height - (event.clientY - drag.y), containerHeight));
          }}
          onPointerUp={finishDrag}
          onPointerCancel={() => { dragRef.current = null; setDragHeight(null); }}
          onLostPointerCapture={() => { dragRef.current = null; setDragHeight(null); }} />
        {mounted && <TerminalWorkspace cwd={project?.path} title={project?.name} visible={visible} onHide={hide} />}
      </div>
    </section>
  );
}
