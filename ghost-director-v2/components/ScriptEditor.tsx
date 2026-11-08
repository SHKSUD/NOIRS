'use client';

import { useActionState } from 'react';
import { rerunBreakdown, saveScript, type FormState } from '@/app/actions';

export default function ScriptEditor({ id, title, script }: { id: string; title: string; script: string }) {
  const [saveState, save, saving] = useActionState<FormState, FormData>(saveScript.bind(null, id), undefined);
  const [runState, rerun, running] = useActionState<FormState, FormData>(rerunBreakdown.bind(null, id), undefined);
  const busy = saving || running;
  const state = runState?.error ? runState : saveState;

  return (
    <form className="card space-y-4 p-5" action={save} aria-busy={busy}>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" defaultValue={title} className="field" maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="script">Script</label>
        <textarea id="script" name="script" defaultValue={script} required minLength={20} className="field min-h-96 font-mono text-sm leading-relaxed" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {!state?.error && saveState?.ok && <p role="status" className="text-sm text-ok">{saveState.ok}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-gold" disabled={busy}>{saving ? 'Saving…' : 'Save script'}</button>
        <button
          type="submit" formAction={rerun} className="btn btn-ghost" disabled={busy}
          onClick={e => { if (!confirm('Re-run the breakdown? This replaces ALL scenes and shots, and your shot edits will be lost.')) e.preventDefault(); }}
        >
          {running ? 'Breaking down…' : 'Save & re-run breakdown'}
        </button>
      </div>
      <p className="text-xs text-muted">Saving the script never changes your shots. Only “re-run breakdown” replaces them.</p>
    </form>
  );
}
