'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createCharacter, type FormState } from '@/app/actions';

export default function AddCharacterForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCharacter.bind(null, projectId), undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);

  return (
    <form ref={form} action={action} className="card space-y-3 p-4" aria-busy={pending}>
      <h2 className="font-display text-sm font-semibold tracking-widest text-gold">ADD CHARACTER</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div>
          <label className="label" htmlFor="new-name">Name</label>
          <input id="new-name" name="name" required maxLength={120} className="field" placeholder="e.g. RAVI" />
        </div>
        <div>
          <label className="label" htmlFor="new-file">Reference image (optional)</label>
          <input id="new-file" name="file" type="file" accept="image/png,image/jpeg,image/webp"
            className="field text-sm file:mr-3 file:rounded file:border-0 file:bg-gold/15 file:px-2 file:py-1 file:text-gold" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="new-note">Style note</label>
        <textarea id="new-note" name="styleNote" maxLength={2000} className="field min-h-16 text-sm"
          placeholder="Look that must stay the same in every shot: age, build, hair, costume, props." />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-ok">{state.ok}</p>}
      <button type="submit" className="btn btn-gold" disabled={pending}>{pending ? 'Adding…' : 'Add character'}</button>
    </form>
  );
}
