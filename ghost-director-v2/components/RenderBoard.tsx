'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pollRender, setRenderQuality, startRender } from '@/app/actions';
import type { RenderState } from '@/lib/render';

export type RenderShot = {
  id: string; number: string; scene: string; description: string; camera: string; durationSec: number;
  frameUrl: string | null; render: RenderState;
};

const POLL_MS = 1500;

// Approximate USD per second of output (Gemini API pricing page, checked 2026-11-09). Mock is free.
const RATE: Record<string, Record<'draft' | 'final', number>> = { omni: { draft: 0.023, final: 0.07 } };
// Omni bills whole seconds between 3 and 15 per clip.
const billedSecs = (d: number) => Math.min(15, Math.max(3, Math.ceil(d)));

export default function RenderBoard({ projectId, shots: initial, provider, quality }: { projectId: string; shots: RenderShot[]; provider: string; quality: 'draft' | 'final' }) {
  const router = useRouter();
  const [savingQuality, setSavingQuality] = useState(false);
  const [shots, setShots] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const polling = useRef(false);

  const setRender = (id: string, render: RenderState) => setShots(prev => prev.map(s => (s.id === id ? { ...s, render } : s)));
  const setError = (id: string, msg: string) => setErrors(prev => ({ ...prev, [id]: msg }));

  // Poll every shot that is rendering until it finishes.
  const renderingIds = shots.filter(s => s.render.status === 'rendering').map(s => s.id).join(',');
  useEffect(() => {
    if (!renderingIds) return;
    const t = setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      for (const id of renderingIds.split(',')) {
        const r = await pollRender(id).catch(() => null);
        if (r?.ok) setRender(id, r.render);
      }
      polling.current = false;
    }, POLL_MS);
    return () => clearInterval(t);
  }, [renderingIds]);

  const paid = provider !== 'mock';
  const todo = shots.filter(s => !s.render.blocked && s.render.status !== 'rendering' && (!s.render.url || s.render.stale));
  const n = {
    upToDate: shots.filter(s => s.render.url && !s.render.stale && s.render.status !== 'rendering').length,
    stale: shots.filter(s => s.render.stale && !s.render.blocked && s.render.status !== 'rendering').length, // blocked shots are counted below
    rendering: shots.filter(s => s.render.status === 'rendering').length,
    blocked: shots.filter(s => s.render.blocked && s.render.status !== 'rendering').length,
  };
  const secs = (list: RenderShot[]) => Math.round(list.reduce((t, s) => t + s.durationSec, 0) * 10) / 10;
  const doneSecs = secs(shots.filter(s => s.render.url && !s.render.stale));
  const todoSecs = secs(todo);

  const rate = RATE[provider]?.[quality];
  const cost = (list: RenderShot[]) => (rate ? ` (about ${(list.reduce((t, s) => t + billedSecs(s.durationSec), 0) * rate).toFixed(2)})` : '');

  async function changeQuality(q: string) {
    if (q === quality) return;
    setSavingQuality(true);
    const r = await setRenderQuality(projectId, q);
    setSavingQuality(false);
    if (r.ok) router.refresh(); else alert(r.error);
  }

  async function start(s: RenderShot, force: boolean) {
    setError(s.id, '');
    const r = await startRender(s.id, force).catch(e => ({ ok: false as const, error: String(e?.message || e) }));
    if (r.ok) setRender(s.id, r.render); else setError(s.id, r.error);
  }

  async function renderAll() {
    if (paid && !confirm(`Render ${todo.length} clip${todo.length === 1 ? '' : 's'} (${todoSecs}s of video) with ${provider} at ${quality} quality? This costs money${cost(todo)}.`)) return;
    setStarting(true);
    for (const s of todo) await start(s, false);
    setStarting(false);
  }

  async function one(s: RenderShot) {
    const force = !!s.render.url && !s.render.stale; // up-to-date clips re-render only on purpose
    if (paid && !confirm(`${force ? 'Re-render' : 'Render'} shot ${s.number} (${s.durationSec}s) with ${provider} at ${quality} quality? This costs money${cost([s])}.`)) return;
    await start(s, force);
  }

  let lastScene = '';
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <p className="text-sm">
          <b className="text-gold">{n.upToDate}</b> up to date
          <span className="text-muted"> · </span><b className={n.stale ? 'text-gold' : ''}>{n.stale}</b> out of date
          <span className="text-muted"> · </span><b>{n.rendering}</b> rendering
          {n.blocked > 0 && <><span className="text-muted"> · </span><b>{n.blocked}</b> need a frame</>}
        </p>
        <p className="text-xs text-muted">{doneSecs}s of {secs(shots)}s rendered</p>
        <label className="flex items-center gap-2 text-xs text-muted">
          Quality
          <select className="field w-auto py-1 text-xs" value={quality} disabled={savingQuality || n.rendering > 0}
            onChange={e => changeQuality(e.target.value)} aria-describedby="quality-hint">
            <option value="draft">Draft (360p{RATE[provider] ? `, ~${RATE[provider].draft}/s` : ''})</option>
            <option value="final">Final (720p{RATE[provider] ? `, ~${RATE[provider].final}/s` : ''})</option>
          </select>
        </label>
        <p id="quality-hint" className="sr-only">Changing quality marks every clip out of date. Nothing re-renders until you click Update.</p>
        <button type="button" className="btn btn-gold ml-auto" disabled={starting || todo.length === 0} onClick={renderAll}>
          {starting ? 'Starting…' : todo.length ? `Update ${todo.length} clip${todo.length === 1 ? '' : 's'}` : n.rendering ? 'Rendering…' : n.blocked ? 'Waiting on frames' : 'All up to date'}
        </button>
        {n.blocked > 0 && (
          <p className="w-full text-xs text-muted">
            {n.blocked} shot{n.blocked === 1 ? ' has' : 's have'} no up-to-date frame. <Link className="text-gold underline-offset-2 hover:underline" href={`/projects/${projectId}/storyboard`}>Update frames in Storyboard</Link> first.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shots.map(s => {
          const header = s.scene !== lastScene ? s.scene : null;
          lastScene = s.scene;
          const r = s.render;
          const busy = r.status === 'rendering';
          const err = errors[s.id] || r.error;
          const label = busy ? 'Rendering…' : !r.url ? 'Render clip' : r.stale ? 'Update clip' : 'Re-render';
          return (
            <div key={s.id} className="contents">
              {header && <h2 className="col-span-full mt-2 font-display text-sm font-semibold tracking-widest text-muted">{header}</h2>}
              <article className="card space-y-2 p-3" aria-label={`Shot ${s.number}`}>
                <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-ink/60">
                  {r.url ? (
                    r.isVideo
                      ? <video src={r.url} className="h-full w-full object-cover" controls muted loop playsInline />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={r.url} alt={`Clip for shot ${s.number}`} className={`h-full w-full object-cover ${r.stale ? 'opacity-60' : ''}`} />
                  ) : s.frameUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.frameUrl} alt="" className="h-full w-full object-cover opacity-30" />
                  ) : null}
                  {!r.url && !busy && <span className="absolute inset-0 grid place-items-center text-xs text-muted">{r.blocked ? 'Needs an up-to-date frame' : 'Not rendered'}</span>}
                  {busy && <div className="absolute inset-0 grid place-items-center bg-ink/70 text-xs text-gold"><span className="animate-pulse">Rendering…</span></div>}
                  {r.stale && !busy && <span className="absolute left-2 top-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-ink">Out of date</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {r.blocked && !busy ? (
                    <Link href={`/projects/${projectId}/storyboard`} className="btn btn-ghost px-3 py-1.5 text-xs">{r.blocked === 'no-frame' ? 'Make frame first' : 'Update frame first'}</Link>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => one(s)}
                      className={`btn px-3 py-1.5 text-xs ${!r.url || r.stale ? 'btn-gold' : 'btn-ghost'}`}>{label}</button>
                  )}
                  {err && <span role="alert" className="truncate text-xs text-danger" title={err}>{err}</span>}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-xs font-semibold tracking-widest text-gold">SHOT {s.number}</span>
                  <span className="text-xs text-muted">{s.camera || '—'} · {s.durationSec}s</span>
                </div>
                <p className="line-clamp-2 text-sm">{s.description}</p>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
