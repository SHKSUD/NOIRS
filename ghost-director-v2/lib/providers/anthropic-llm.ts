import { normalizeBreakdown } from './normalize';
import { CAMERAS, FRAMINGS, type LLMProvider } from './types';

// Claude via plain fetch (no SDK dependency).
const PROMPT = `You are a film director and first AD. Break the screenplay below into scenes and a shot list.
Return ONLY JSON, no prose, in exactly this shape:
{"characters":[{"name":"ARJUN","styleNote":"short visual description to keep the character consistent"}],
 "scenes":[{"heading":"EXT. ROOFTOP - NIGHT","summary":"1 sentence","shots":[
   {"description":"what we see, 1-2 sentences","camera":"one of: ${CAMERAS.join(', ')}","framing":"one of: ${FRAMINGS.join(', ')}","mood":"2-3 words","durationSec":3,"dialogue":"NAME: line, or empty","characters":["ARJUN"]}]}]}
Rules: one shot per distinct visual moment; keep dialogue in its original language; character names in CAPS and consistent.

Screenplay:
`;

export const anthropicLLM: LLMProvider = {
  name: 'anthropic',
  async breakdownScript(script) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: PROMPT + script }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Claude error ${r.status}`);
    const text: string = (j.content || []).map((c: { text?: string }) => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Claude did not return JSON.');
    return normalizeBreakdown(JSON.parse(m[0]));
  },
};
