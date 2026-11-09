'use client';

import { useCallback, useRef, useState } from 'react';
import { removeCharacterReference, setCharacterReference, updateCharacter } from '@/app/actions';
import { useAutosave } from './useAutosave';
import SaveBadge from './SaveBadge';

type Props = { id: string; name: string; styleNote: string; referenceUrl: string | null; shotCount: number };

export default function CharacterCard({ id, name, styleNote, referenceUrl, shotCount }: Props) {
  const [note, setNote] = useState(styleNote);
  const [ref, setRef] = useState(referenceUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const save = useCallback((p: { styleNote?: string }) => updateCharacter(id, p), [id]);
  const { status, error, queue, flush } = useAutosave(save);

  const shotsText = `${shotCount} shot${shotCount === 1 ? '' : 's'}`;

  function pick() {
    if (ref && shotCount && !confirm(`Replace ${name}'s locked reference? Frames in ${shotsText} will be marked out of date. Other shots are not affected.`)) return;
    input.current?.click();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    const r = await setCharacterReference(id, fd).catch(e => ({ ok: false as const, error: String(e?.message || e) }));
    setBusy(false);
    if (input.current) input.current.value = '';
    if (r.ok) setRef(r.url); else setErr(r.error);
  }

  async function remove() {
    if (!confirm(`Remove ${name}'s reference? Frames in ${shotsText} will be marked out of date.`)) return;
    setBusy(true); setErr('');
    const r = await removeCharacterReference(id);
    setBusy(false);
    if (r.ok) setRef(null); else setErr(r.error || 'Could not remove.');
  }

  return (
    <article className="card flex flex-col gap-4 p-4 sm:flex-row" aria-labelledby={`${id}-n`}>
      <div className="w-full shrink-0 sm:w-40">
        <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-ink/60">
          {ref ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ref} alt={`${name} reference`} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center p-3 text-center text-xs text-muted">No reference yet</div>
          )}
          {busy && <div className="absolute inset-0 grid place-items-center bg-ink/70 text-xs text-gold">Uploading…</div>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden
          onChange={e => upload(e.target.files?.[0])} />
        <div className="mt-2 flex gap-2">
          <button type="button" className={`btn flex-1 px-3 py-1.5 text-xs ${ref ? 'btn-ghost' : 'btn-gold'}`} onClick={pick} disabled={busy}>
            {ref ? 'Replace' : 'Upload reference'}
          </button>
          {ref && <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={remove} disabled={busy} aria-label={`Remove ${name} reference`}>Remove</button>}
        </div>
        {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${id}-n`} className="font-display text-lg font-semibold tracking-wide">{name}</h3>
          {ref ? (
            <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[11px] font-semibold text-gold">🔒 Locked reference</span>
          ) : (
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Not locked</span>
          )}
          <span className="text-xs text-muted">in {shotsText}</span>
          <SaveBadge status={status} error={error} onRetry={() => flush()} />
        </div>
        <label className="label" htmlFor={`${id}-note`}>Style note</label>
        <textarea id={`${id}-note`} className="field min-h-24 text-sm" value={note} maxLength={2000} onBlur={() => flush()}
          placeholder="Look that must stay the same in every shot: age, build, hair, costume, props."
          onChange={e => { setNote(e.target.value); queue({ styleNote: e.target.value }); }} />
        <p className="text-xs text-muted">Every frame with {name} uses this reference and note. Changing either marks only {name}&apos;s shots out of date.</p>
      </div>
    </article>
  );
}
