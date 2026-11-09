'use client';

import { useState } from 'react';
import { generateFrame } from '@/app/actions';
import type { FrameState } from '@/lib/storyboard';
import FramePanel from './FramePanel';

export type BoardShot = { id: string; number: string; scene: string; description: string; framing: string; durationSec: number; characters: string[]; frame: FrameState };

export default function StoryboardBoard({ shots: initial }: { shots: BoardShot[] }) {
  const [shots, setShots] = useState(initial);
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState('');

  const setFrame = (id: string, frame: FrameState) => setShots(prev => prev.map(s => (s.id === id ? { ...s, frame } : s)));
  const missing = shots.filter(s => !s.frame.url).length;
  const stale = shots.filter(s => s.frame.stale).length;
  const todo = shots.filter(s => !s.frame.url || s.frame.stale);

  // Updates only frames that are missing or out of date, one shot at a time. Up-to-date frames are left alone.
  async function updateAll() {
    setNote('');
    setRun({ done: 0, total: todo.length });
    let failed = 0;
    for (const [i, s] of todo.entries()) {
      const r = await generateFrame(s.id).catch(() => null);
      if (r?.ok) { setFrame(s.id, r.frame); if (r.frame.error) failed++; } else failed++;
      setRun({ done: i + 1, total: todo.length });
    }
    setRun(null);
    setNote(failed ? `${failed} frame${failed === 1 ? '' : 's'} failed. See the shot for details.` : 'All frames are up to date.');
  }

  let lastScene = '';
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <p className="text-sm">
          <b className="text-gold">{shots.length - missing - stale}</b> up to date
          <span className="text-muted"> · </span><b className={stale ? 'text-gold' : ''}>{stale}</b> out of date
          <span className="text-muted"> · </span><b>{missing}</b> missing
        </p>
        <button type="button" className="btn btn-gold ml-auto" disabled={!!run || todo.length === 0} onClick={updateAll}>
          {run ? `Drawing ${run.done}/${run.total}…` : todo.length ? `Update ${todo.length} frame${todo.length === 1 ? '' : 's'}` : 'All up to date'}
        </button>
        {note && <p role="status" className="w-full text-xs text-muted">{note}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shots.map(s => {
          const header = s.scene !== lastScene ? s.scene : null;
          lastScene = s.scene;
          return (
            <div key={s.id} className="contents">
              {header && <h2 className="col-span-full mt-2 font-display text-sm font-semibold tracking-widest text-muted">{header}</h2>}
              <article className="card space-y-2 p-3" aria-label={`Shot ${s.number}`}>
                <FramePanel shotId={s.id} frame={s.frame} onFrame={f => setFrame(s.id, f)} alt={`Storyboard frame for shot ${s.number}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-xs font-semibold tracking-widest text-gold">SHOT {s.number}</span>
                  <span className="text-xs text-muted">{s.framing || '—'} · {s.durationSec}s</span>
                </div>
                <p className="line-clamp-3 text-sm">{s.description}</p>
                {s.characters.length > 0 && <p className="text-xs text-muted">{s.characters.join(', ')}</p>}
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
