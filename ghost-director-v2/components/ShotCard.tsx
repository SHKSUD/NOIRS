'use client';

import { useCallback, useState } from 'react';
import { updateShot, type ShotPatch } from '@/app/actions';
import { CAMERAS, FRAMINGS } from '@/lib/providers/types';
import { useAutosave } from './useAutosave';
import SaveBadge from './SaveBadge';
import FramePanel from './FramePanel';
import type { FrameState } from '@/lib/storyboard';
import type { RenderState } from '@/lib/render';

export type ShotData = {
  id: string; number: string; description: string; camera: string; framing: string; mood: string;
  durationSec: number; dialogue: string; characterIds: string[];
};
type Character = { id: string; name: string };

export default function ShotCard({ shot, characters, frame: initialFrame, render: initialRender }: { shot: ShotData; characters: Character[]; frame: FrameState; render: RenderState }) {
  const [s, setS] = useState(shot);
  const [frame, setFrame] = useState(initialFrame);
  const [render, setRender] = useState(initialRender);
  const [dur, setDur] = useState(String(shot.durationSec)); // text, so half-typed values like "2." are allowed
  const durNum = parseFloat(dur);
  const durBad = dur !== '' && !(durNum >= 0.5 && durNum <= 60);
  const save = useCallback(async (p: ShotPatch) => {
    const r = await updateShot(shot.id, p);
    if (r.ok) { setFrame(r.frame); setRender(r.render); } // edits can make the frame and clip out of date
    return r;
  }, [shot.id]);
  const { status, error, queue, flush } = useAutosave<ShotPatch>(save);

  const set = <K extends keyof ShotData & keyof ShotPatch>(k: K, v: ShotData[K]) => {
    setS(prev => ({ ...prev, [k]: v }));
    queue({ [k]: v } as ShotPatch);
  };
  const id = (f: string) => `${shot.id}-${f}`;
  const toggleChar = (cid: string) => {
    const next = s.characterIds.includes(cid) ? s.characterIds.filter(x => x !== cid) : [...s.characterIds, cid];
    set('characterIds', next);
    flush();
  };

  return (
    <article className="card p-4" aria-labelledby={id('n')} onBlur={() => flush()}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 id={id('n')} className="font-display text-sm font-semibold tracking-widest text-gold">SHOT {s.number}</h3>
        <div className="flex items-center gap-3">
          <ClipBadge render={render} />
          <SaveBadge status={status} error={error} onRetry={() => flush()} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,300px)]">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor={id('desc')}>Description</label>
            <textarea id={id('desc')} className="field min-h-20 text-sm" value={s.description} maxLength={2000}
              onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('dlg')}>Dialogue</label>
            <textarea id={id('dlg')} className="field min-h-12 text-sm italic" value={s.dialogue} maxLength={2000} placeholder="No dialogue"
              onChange={e => set('dialogue', e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 self-start">
        <FramePanel shotId={shot.id} frame={frame} onFrame={setFrame} alt={`Storyboard frame for shot ${s.number}`} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={id('frm')}>Framing</label>
            <input id={id('frm')} list="framings" className="field text-sm" value={s.framing} maxLength={120}
              onChange={e => set('framing', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('cam')}>Camera</label>
            <input id={id('cam')} list="cameras" className="field text-sm" value={s.camera} maxLength={120}
              onChange={e => set('camera', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('mood')}>Mood</label>
            <input id={id('mood')} className="field text-sm" value={s.mood} maxLength={120}
              onChange={e => set('mood', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('dur')}>Duration (s)</label>
            <input id={id('dur')} type="number" inputMode="decimal" min={0.5} max={60} step={0.5} className="field text-sm" value={dur}
              aria-invalid={durBad}
              onChange={e => {
                setDur(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n) && n >= 0.5 && n <= 60) set('durationSec', n);
              }}
              onBlur={() => setDur(String(s.durationSec))} />
            {durBad && <p className="mt-1 text-xs text-danger">0.5–60 seconds</p>}
          </div>
        </div>
        </div>
      </div>

      {characters.length > 0 && (
        <fieldset className="mt-3">
          <legend className="label">Characters in shot</legend>
          <div className="flex flex-wrap gap-2">
            {characters.map(c => {
              const on = s.characterIds.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleChar(c.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted hover:border-gold/50 hover:text-text'}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </article>
  );
}

// Shared suggestion lists for the framing/camera inputs (free text is still allowed).
export function ShotDatalists() {
  return (
    <>
      <datalist id="framings">{FRAMINGS.map(f => <option key={f} value={f} />)}</datalist>
      <datalist id="cameras">{CAMERAS.map(c => <option key={c} value={c} />)}</datalist>
    </>
  );
}

function ClipBadge({ render }: { render: RenderState }) {
  const [text, cls] = render.status === 'rendering' ? ['Clip rendering', 'text-gold']
    : render.url && render.stale ? ['Clip out of date', 'text-gold']
    : render.url ? ['Clip up to date', 'text-muted']
    : ['No clip', 'text-muted'];
  return <span className={`text-xs ${cls}`}>{text}</span>;
}
