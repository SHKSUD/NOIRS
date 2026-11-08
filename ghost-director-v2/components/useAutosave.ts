'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

// Debounced autosave: queue(patch) merges edits and saves after `delay` ms; flush() saves now (e.g. on blur).
export function useAutosave<P extends object>(save: (patch: P) => Promise<{ ok: boolean; error?: string }>, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const pending = useRef<Partial<P>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    if (!Object.keys(patch).length) return inflight.current;
    pending.current = {};
    // Chain saves so they reach the server in order.
    inflight.current = inflight.current.then(async () => {
      setStatus('saving');
      const r = await save(patch as P).catch(e => ({ ok: false, error: String(e?.message || e) }));
      if (r.ok) { setStatus(Object.keys(pending.current).length ? 'dirty' : 'saved'); setError(''); }
      else { pending.current = { ...patch, ...pending.current }; setStatus('error'); setError(r.error || 'Save failed'); }
    });
    return inflight.current;
  }, [save]);

  const queue = useCallback((patch: Partial<P>) => {
    pending.current = { ...pending.current, ...patch };
    setStatus('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  return { status, error, queue, flush };
}
