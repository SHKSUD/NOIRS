'use client';

import { useState } from 'react';
import { generateFrame } from '@/app/actions';
import type { FrameState } from '@/lib/storyboard';

export function frameLabel(f: FrameState) {
  if (!f.url) return 'Generate frame';
  return f.stale ? 'Update frame' : 'Regenerate';
}

// One shot's storyboard frame + its generate button. Regenerating touches only this shot.
export default function FramePanel({ shotId, frame, onFrame, alt }: {
  shotId: string; frame: FrameState; onFrame: (f: FrameState) => void; alt: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true); setErr('');
    // Up-to-date frames regenerate only on purpose (force); others update only if their inputs changed.
    const r = await generateFrame(shotId, !!frame.url && !frame.stale).catch(e => ({ ok: false as const, error: String(e?.message || e) }));
    setBusy(false);
    if (r.ok) onFrame(r.frame); else setErr(r.error);
  }

  const error = err || frame.error;
  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-ink/60">
        {frame.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frame.url} alt={alt} className={`h-full w-full object-cover transition ${frame.stale ? 'opacity-60 grayscale-[40%]' : ''}`} />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted">No frame yet</div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-ink/70 text-xs text-gold">Drawing…</div>}
        {frame.stale && !busy && (
          <span className="absolute left-2 top-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-ink">Out of date</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={run} disabled={busy}
          className={`btn px-3 py-1.5 text-xs ${!frame.url || frame.stale ? 'btn-gold' : 'btn-ghost'}`}>
          {busy ? 'Drawing…' : frameLabel(frame)}
        </button>
        {error && <span role="alert" className="truncate text-xs text-danger" title={error}>{error}</span>}
      </div>
    </div>
  );
}
