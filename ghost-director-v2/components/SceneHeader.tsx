'use client';

import { useCallback, useState } from 'react';
import { updateScene } from '@/app/actions';
import { useAutosave } from './useAutosave';
import SaveBadge from './SaveBadge';

type Patch = { heading?: string; summary?: string };

export default function SceneHeader({ id, number, heading, summary, shots, seconds }: {
  id: string; number: number; heading: string; summary: string; shots: number; seconds: number;
}) {
  const [h, setH] = useState(heading);
  const [sum, setSum] = useState(summary);
  const save = useCallback((p: Patch) => updateScene(id, p), [id]);
  const { status, error, queue, flush } = useAutosave<Patch>(save);

  return (
    <div className="space-y-2" onBlur={() => flush()}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-xs tracking-widest text-muted">SCENE {number}</span>
        <span className="text-xs text-muted">{shots} shots · {seconds}s</span>
        <SaveBadge status={status} error={error} onRetry={() => flush()} />
      </div>
      <label className="sr-only" htmlFor={`${id}-h`}>Scene {number} heading</label>
      <input id={`${id}-h`} value={h} maxLength={120}
        onChange={e => { setH(e.target.value); queue({ heading: e.target.value }); }}
        className="field border-transparent bg-transparent! px-0 font-display text-lg font-semibold tracking-wide hover:border-line focus:px-3" />
      <label className="sr-only" htmlFor={`${id}-s`}>Scene {number} summary</label>
      <input id={`${id}-s`} value={sum} maxLength={2000} placeholder="Scene summary"
        onChange={e => { setSum(e.target.value); queue({ summary: e.target.value }); }}
        className="field border-transparent bg-transparent! px-0 text-sm text-muted hover:border-line focus:px-3" />
    </div>
  );
}
