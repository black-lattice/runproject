// WebKit may end composition before dispatching the Enter that confirmed it.
export function createTodoEnterGuard() {
  let composing = false;
  let endedAt = -Infinity;
  return {
    compositionStart() { composing = true; },
    compositionEnd(now = performance.now()) { composing = false; endedAt = now; },
    shouldSubmit(event, now = performance.now()) {
      const native = event.nativeEvent || event;
      return event.key === 'Enter' && !event.repeat
        && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
        && !composing && !native.isComposing && native.keyCode !== 229
        && now - endedAt >= 150;
    },
  };
}

export function createTrayTodo(value, now = Date.now()) {
  const title = value.trim();
  if (!title) return null;
  if (new TextEncoder().encode(title).length > 1000) {
    throw new Error('标题过长，请控制在 1000 字节以内');
  }
  return {
    id: crypto.randomUUID(), createdAt: now, title,
    date: '', time: '', list: '收件箱', priority: '中',
    done: false, status: 'pending', tags: [], reminder: '', repeat: '',
    subtasks: [], detail: '',
  };
}
