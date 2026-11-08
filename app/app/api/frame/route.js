import { G, gkey, err, need } from '../../../lib/supa';
import { requireUser } from '../../../lib/auth';
import { isMock } from '../../../lib/mock';
export const maxDuration = 60;
// Sketch PNG (base64) + shot → finished cinematic frame (base64 PNG)
export async function POST(req) {
  const { res: denied } = await requireUser(req); if (denied) return denied;
  const { sketch, prompt } = await req.json();
  if (isMock('GEMINI_API_KEY')) return sketch ? Response.json({ image: sketch, mock: true }) : err('Mock mode: no sketch sent', 400);
  const miss = need('GEMINI_API_KEY'); if (miss) return miss;
  const parts = [{ text: `Turn this storyboard sketch into a photoreal cinematic film still, 16:9. Keep the exact composition, framing and character positions. ${prompt}` }];
  if (sketch) parts.push({ inline_data: { mime_type: 'image/png', data: sketch } });
  const r = await fetch(`${G}/models/${process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'}:generateContent`, {
    method: 'POST', headers: { ...gkey(), 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } })
  });
  const j = await r.json();
  if (!r.ok) return err(j.error?.message || 'Image error', r.status);
  const img = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
  if (!img) return err('No image returned');
  return Response.json({ image: (img.inlineData || img.inline_data).data });
}
