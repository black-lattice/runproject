import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TerminalWorkspace from '@/components/Terminal/TerminalWorkspace';
import { upsertTerminalPageSession } from '@/utils/terminalPageState';

export default function TerminalPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('sessionId');
    const cwd = searchParams.get('cwd');
    if (!id || !cwd) return;
    upsertTerminalPageSession({ id, cwd, title: searchParams.get('title') || 'Terminal' });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return <TerminalWorkspace />;
}
