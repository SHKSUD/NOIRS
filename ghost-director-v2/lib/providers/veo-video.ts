import type { PollResult, VideoProvider } from './video-types';

// Google Veo via the Gemini API (image-to-video, long-running operation). Untested without a key.
const API = 'https://generativelanguage.googleapis.com/v1beta';
const key = () => {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set.');
  return k;
};

export const veoVideo: VideoProvider = {
  name: 'veo',
  owns: id => id.startsWith('models/'),
  async start(req) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.frame.mime))
      throw new Error('Veo needs a real image frame. Set IMAGE_PROVIDER=gemini and update the frame first.');
    const prompt = `${req.description} Camera: ${req.camera}. Mood: ${req.mood}.${req.dialogue ? ` Dialogue: ${req.dialogue}` : ''} Keep the characters and composition of the starting frame.`;
    const r = await fetch(`${API}/models/${process.env.VEO_MODEL || 'veo-3.0-fast-generate-001'}:predictLongRunning`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key(), 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt, image: { bytesBase64Encoded: req.frame.data.toString('base64'), mimeType: req.frame.mime } }],
        parameters: { aspectRatio: '16:9' },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Veo error ${r.status}`);
    return { jobId: j.name };
  },
  async poll(jobId): Promise<PollResult> {
    if (!/^[\w/.-]+$/.test(jobId)) return { done: true, error: 'Bad job id.' };
    const r = await fetch(`${API}/${jobId}`, { headers: { 'x-goog-api-key': key() } });
    const j = await r.json();
    if (!r.ok) return { done: true, error: j?.error?.message || `Veo poll error ${r.status}` };
    if (!j.done) return { done: false };
    if (j.error) return { done: true, error: j.error.message || 'Veo render failed.' };
    const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return { done: true, error: 'No video returned (it may have been blocked by safety filters).' };
    const v = await fetch(uri, { headers: { 'x-goog-api-key': key() }, redirect: 'follow' });
    if (!v.ok) return { done: true, error: `Could not download the video (${v.status}).` };
    return { done: true, data: Buffer.from(await v.arrayBuffer()), mime: 'video/mp4' };
  },
};
