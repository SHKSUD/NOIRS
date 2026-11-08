'use client';

import { useActionState, useRef } from 'react';
import { createProject, type FormState } from '@/app/actions';
import { SAMPLE_SCRIPT, SAMPLE_TITLE } from './sample-script';

export default function NewProjectForm({ provider }: { provider: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProject, undefined);
  const title = useRef<HTMLInputElement>(null);
  const script = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={action} className="card space-y-4 p-5" aria-busy={pending}>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input ref={title} id="title" name="title" className="field" placeholder="Untitled film" maxLength={120} />
      </div>
      <div>
        <div className="flex items-end justify-between gap-2">
          <label className="label" htmlFor="script">Script</label>
          <button
            type="button"
            className="mb-1.5 text-xs text-muted underline-offset-2 hover:text-gold hover:underline"
            onClick={() => { if (title.current) title.current.value = SAMPLE_TITLE; if (script.current) script.current.value = SAMPLE_SCRIPT; }}
          >
            Use sample script
          </button>
        </div>
        <textarea
          ref={script} id="script" name="script" required minLength={20}
          className="field min-h-72 font-mono text-sm leading-relaxed"
          placeholder={'EXT. ROOFTOP - NIGHT\n\nRain. ARJUN (30s) stands at the edge…\n\nMEERA: You came.'}
        />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-gold" disabled={pending}>
          {pending ? 'Breaking down…' : 'Break down into shots'}
        </button>
        <span className="text-xs text-muted">
          LLM: <span className={provider === 'mock' ? 'text-gold' : ''}>{provider === 'mock' ? 'mock (no API key)' : provider}</span>
        </span>
      </div>
    </form>
  );
}
