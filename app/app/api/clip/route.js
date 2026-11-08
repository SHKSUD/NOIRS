import { G, gkey, err, supa, need } from '../../../lib/supa';
import { requireUser } from '../../../lib/auth';
import { isMock } from '../../../lib/mock';
export const maxDuration = 60;
// POST: start Veo job from frame → {op}.  GET ?op=: poll → {done, url}
export async function POST(req) {
  const { res: denied } = await requireUser(req); if (denied) return denied;
  const { image, prompt } = await req.json();
  if (isMock('GEMINI_API_KEY')) return err('Mock mode: frame step OK. Add GEMINI_API_KEY to .env.local to animate with Veo.', 503);
  const miss = need('GEMINI_API_KEY'); if (miss) return miss;
  const inst = { prompt };
  if (image) inst.image = { bytesBase64Encoded: image, mimeType: 'image/png' };
  const r = await fetch(`${G}/models/${process.env.VEO_MODEL || 'veo-3.0-fast-generate-001'}:predictLongRunning`, {
    method: 'POST', headers: { ...gkey(), 'content-type': 'application/json' },
    body: JSON.stringify({ instances: [inst], parameters: { aspectRatio: '16:9' } })
  });
  const j = await r.json();
  if (!r.ok) return err(j.error?.message || 'Veo error', r.status);
  return Response.json({ op: j.name });
}
export async function GET(req) {
  const { res: denied } = await requireUser(req); if (denied) return denied;
  const miss = need('GEMINI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'); if (miss) return miss;
  const op = new URL(req.url).searchParams.get('op');
  if (!op || !/^[\w\/.-]+$/.test(op)) return err('bad op', 400);
  const r = await fetch(`${G}/${op}`, { headers: gkey() });
  const j = await r.json();
  if (!r.ok) return err(j.error?.message || 'poll error', r.status);
  if (!j.done) return Response.json({ done: false });
  if (j.error) return err(j.error.message);
  const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) return err('No video (may be blocked by safety filters)');
  const v = await fetch(uri, { headers: gkey(), redirect: 'follow' });
  const buf = Buffer.from(await v.arrayBuffer());
  const path = `${op.split('/').pop()}.mp4`;
  const s = supa();
  const up = await s.storage.from('clips').upload(path, buf, { contentType: 'video/mp4', upsert: true });
  if (up.error) return err(up.error.message);
  return Response.json({ done: true, url: s.storage.from('clips').getPublicUrl(path).data.publicUrl });
}
