import { err, need } from '../../../lib/supa';
import { requireUser } from '../../../lib/auth';
import { isMock, mockClaude } from '../../../lib/mock';
export const maxDuration = 60;
export async function POST(req) {
  const { res: denied } = await requireUser(req); if (denied) return denied;
  const { input } = await req.json();
  if (isMock('ANTHROPIC_API_KEY')) return Response.json({ text: await mockClaude(input) });
  const miss = need('ANTHROPIC_API_KEY'); if (miss) return miss;
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 8000, messages })
  });
  const j = await r.json();
  if (!r.ok) return err(j.error?.message || 'Claude error', r.status);
  return Response.json({ text: j.content.map(c => c.text || '').join('') });
}
