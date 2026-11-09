'use client';

import Link from 'next/link';
import { useState } from 'react';
import { assembleExport } from '@/app/actions';
import type { CutPlan, ExportState } from '@/lib/assemble';

export default function ExportPanel({ projectId, plan: initialPlan, state: initialState }: { projectId: string; plan: CutPlan; state: ExportState }) {
  const [plan, setPlan] = useState(initialPlan);
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function assemble() {
    setBusy(true); setMsg(null);
    const r = await assembleExport(projectId).catch(e => ({ ok: false as const, error: String(e?.message || e) }));
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, error: true }); return; }
    setPlan(r.plan); setState(r.state);
    setMsg({ text: r.reused ? 'The cut was already up to date. Nothing was re-encoded.' : `Cut assembled: ${r.plan.included} shots, ${r.plan.seconds}s.` });
  }

  const skipped = plan.items.filter(i => i.kind === 'skip');
  const label = busy ? 'Assembling…' : !state.url ? 'Assemble cut' : state.fresh ? 'Cut is up to date' : 'Re-assemble cut';

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm">
            <b className="text-gold">{plan.included}</b> of {plan.items.length} shots ready · <b>{plan.seconds}s</b>
            {skipped.length > 0 && <><span className="text-muted"> · </span><b className="text-gold">{skipped.length}</b> will be skipped</>}
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={`btn ${state.fresh ? 'btn-ghost' : 'btn-gold'}`} disabled={busy || plan.included === 0 || (state.fresh && !!state.url)} onClick={assemble}>
              {label}
            </button>
            {state.url && (
              <a href={`/projects/${projectId}/export/download`} className={`btn ${state.fresh ? 'btn-gold' : 'btn-ghost'}`} download>
                Download MP4
              </a>
            )}
          </div>
        </div>
        {msg && <p role={msg.error ? 'alert' : 'status'} className={`text-sm ${msg.error ? 'text-danger' : 'text-ok'}`}>{msg.text}</p>}
        {plan.included === 0 && <p className="text-sm text-muted">No shot has an up-to-date clip yet. <Link href={`/projects/${projectId}/render`} className="text-gold hover:underline">Render shots</Link> first.</p>}
        {state.url && !state.fresh && <p className="text-sm text-gold">Shots changed since this cut was made. Re-assemble to include the latest clips.</p>}
        {state.url && (
          <video key={state.url} src={state.url} controls playsInline className="aspect-video w-full rounded-lg border border-line bg-black" />
        )}
        {state.exportedAt && <p className="text-xs text-muted">Last assembled {new Date(state.exportedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
      </div>

      <section className="space-y-2" aria-label="Shots in the cut">
        <h2 className="label">Shots in scene order</h2>
        <ol className="card divide-y divide-line">
          {plan.items.map(i => (
            <li key={i.shotId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className={`w-14 shrink-0 font-display text-xs font-semibold tracking-widest ${i.kind === 'skip' ? 'text-muted' : 'text-gold'}`}>{i.number}</span>
              <span className={`min-w-0 flex-1 truncate ${i.kind === 'skip' ? 'text-muted line-through decoration-muted/50' : ''}`}>{i.description}</span>
              <span className="text-xs text-muted">{i.durationSec}s</span>
              {i.kind === 'skip' ? (
                <Link href={`/projects/${projectId}/render`} className="rounded border border-gold/50 px-1.5 py-0.5 text-[11px] font-semibold text-gold hover:bg-gold/10">Skipped: {i.reason}</Link>
              ) : i.kind === 'mock' ? (
                <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted" title="Mock clips are previews; the cut shows a title card for them.">Title card (mock)</span>
              ) : (
                <span className="rounded border border-ok/40 px-1.5 py-0.5 text-[11px] text-ok">Clip</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
