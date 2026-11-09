import type { ImageProvider } from './image-types';

// Gemini image model via plain fetch. Character reference images are passed as inline images
// so the same faces/costumes are reused in every frame.
export const geminiImage: ImageProvider = {
  name: 'gemini',
  async generateFrame(req) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not set.');
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

    const parts: object[] = [{
      text: `Storyboard frame for a short film, 16:9, cinematic film still.
Scene: ${req.sceneHeading}. Shot ${req.shotNumber}: ${req.description}
Framing: ${req.framing}. Camera: ${req.camera}. Mood: ${req.mood}.
Characters in frame: ${req.characters.map(c => `${c.name}${c.styleNote ? ` (${c.styleNote})` : ''}`).join('; ') || 'none'}.
Keep each character's face, hair and costume exactly as in their reference image. No text or captions in the image.`,
    }];
    for (const c of req.characters) {
      if (!c.reference) continue;
      parts.push({ text: `Reference image for ${c.name}:` });
      parts.push({ inline_data: { mime_type: c.reference.mime, data: c.reference.data.toString('base64') } });
    }

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Gemini error ${r.status}`);
    const img = j.candidates?.[0]?.content?.parts?.find((p: Record<string, unknown>) => p.inlineData || p.inline_data);
    const d = img && (img.inlineData || img.inline_data);
    if (!d?.data) throw new Error('No image returned (it may have been blocked by safety filters).');
    return { data: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' };
  },
};
