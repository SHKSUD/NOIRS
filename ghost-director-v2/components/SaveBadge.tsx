import type { SaveStatus } from './useAutosave';

const TEXT: Record<SaveStatus, string> = { idle: '', dirty: 'Editing…', saving: 'Saving…', saved: 'Saved', error: 'Not saved' };

export default function SaveBadge({ status, error, onRetry }: { status: SaveStatus; error?: string; onRetry?: () => void }) {
  if (status === 'idle') return null;
  return (
    <span role="status" className={`text-xs ${status === 'error' ? 'text-danger' : status === 'saved' ? 'text-ok' : 'text-muted'}`} title={error}>
      {status === 'saved' && '✓ '}{TEXT[status]}
      {status === 'error' && onRetry && <button type="button" onClick={onRetry} className="ml-2 underline hover:text-gold">Retry</button>}
    </span>
  );
}
