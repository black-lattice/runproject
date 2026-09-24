import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { createTodoEnterGuard, createTrayTodo } from '@/utils/trayTodoInput';

export default function TrayTodoComposer({ disabled, onAdd }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const draft = useRef('');
  const guard = useRef(createTodoEnterGuard());
  return <div className="tray-todo-composer">
    <div className="tray-todo-composer-line">
      <Plus size={14} aria-hidden="true" />
      <input type="text" value={value} disabled={disabled} aria-label="添加待办"
        placeholder="添加待办，按 Enter 保存" autoComplete="off"
        aria-invalid={Boolean(error)} aria-describedby={error ? 'tray-todo-input-error' : undefined}
        onChange={event => { draft.current = event.target.value; setValue(draft.current); setError(''); }}
        onCompositionStart={() => guard.current.compositionStart()}
        onCompositionEnd={event => {
          guard.current.compositionEnd();
          draft.current = event.currentTarget.value;
          setValue(draft.current);
        }}
        onKeyDown={event => {
          if (disabled || !guard.current.shouldSubmit(event)) return;
          event.preventDefault();
          try {
            const task = createTrayTodo(draft.current);
            if (!task) return;
            onAdd(task);
            draft.current = '';
            setValue('');
            setError('');
          } catch (failure) {
            setError(failure.message || String(failure));
          }
        }} />
    </div>
    {error && <p id="tray-todo-input-error" className="tray-panel-error" role="alert">{error}</p>}
  </div>;
}
