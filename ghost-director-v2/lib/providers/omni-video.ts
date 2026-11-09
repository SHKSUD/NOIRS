import type { PollResult, VideoProvider } from './video-types';

// Gemini Omni Flash (gemini-omni-1.2-flash) via the Gemini API Interactions endpoint, image-to-video.
// Runs in the background: POST /v1beta/interactions {background: true} -> id, then GET /v1beta/interactions/{id}
// until status is "completed"; the MP4 comes back base64-encoded in steps[].content[] (type "video").
// Docs: aistudio.google.com/docs/omni and /api-reference/interactions-api (checked 2026-11-09).

const base = () => (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const key = () => {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set.');
  return k;
};
const PREFIX = 'omni-';
const RESOLUTION = { draft: '360p', final: '720p' } as const;

type Part = { type?: string; data?: string; uri?: string; mime_type?: string; text?: string };
type Interaction = { id?: string; status?: string; steps?: { type?: string; content?: Part[] }[]; errors?: { message?: string }[]; error?: { message?: string } };

const errorOf = (j: Interaction, fallback: string) => j.errors?.[0]?.message || j.error?.message || fallback;

async function readJson(r: Response): Promise<Interaction> {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: { message: text.slice(0, 300) || `HTTP ${r.status}` } }; }
}

export const omniVideo: VideoProvider = {
  name: 'omni',
  owns: id => id.startsWith(PREFIX),

  async start(req) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.frame.mime))
      throw new Error('Omni Flash needs a real image frame. Set IMAGE_PROVIDER=gemini and update the frame first.');
    // Omni accepts whole seconds from 3 to 15; assembly trims or holds the clip to the shot's exact duration.
    const seconds = Math.min(15, Math.max(3, Math.ceil(req.durationSec)));
    const prompt = [
      `Animate this storyboard frame into one continuous cinematic shot. ${req.description}`,
      req.camera && `Camera: ${req.camera}.`,
      req.mood && `Mood: ${req.mood}.`,
      req.dialogue ? `Spoken dialogue (keep the language as written): ${req.dialogue}` : 'No dialogue.',
      'Keep the characters, costumes and composition of the starting frame. No on-screen text.',
    ].filter(Boolean).join(' ');

    const r = await fetch(`${base()}/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key(), 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OMNI_MODEL || 'gemini-omni-1.2-flash',
        input: [
          { type: 'image', data: req.frame.data.toString('base64'), mime_type: req.frame.mime },
          { type: 'text', text: prompt },
        ],
        response_format: { type: 'video', aspect_ratio: '16:9', duration: `${seconds}s`, resolution: RESOLUTION[req.quality] },
        background: true,
        store: true, // background runs require stored interactions
      }),
    });
    const j = await readJson(r);
    if (!r.ok) throw new Error(errorOf(j, `Omni error ${r.status}`));
    if (!j.id || !/^[\w.-]+$/.test(j.id)) throw new Error('Omni did not return an interaction id.');
    return { jobId: PREFIX + j.id };
  },

  async poll(jobId): Promise<PollResult> {
    const id = jobId.slice(PREFIX.length);
    if (!/^[\w.-]+$/.test(id)) return { done: true, error: 'Bad job id.' };
    const r = await fetch(`${base()}/interactions/${id}`, { headers: { 'x-goog-api-key': key() } });
    const j = await readJson(r);
    if (!r.ok) return { done: true, error: errorOf(j, `Omni poll error ${r.status}`) };

    switch (j.status) {
      case 'in_progress':
      case 'requires_continuation':
        return { done: false };
      case 'failed':
      case 'cancelled':
        return { done: true, error: errorOf(j, `The render ${j.status}.`) };
      case 'requires_action':
        return { done: true, error: 'Omni asked for more input; this app does not support that. Try rewording the shot.' };
    }

    const video = (j.steps || []).flatMap(s => s.content || []).find(p => p.type === 'video');
    if (video?.data) return { done: true, data: Buffer.from(video.data, 'base64'), mime: video.mime_type || 'video/mp4' };
    if (video?.uri) {
      const url = /^https:\/\//.test(video.uri) ? video.uri : `${base()}/${video.uri.replace(/^\//, '')}:download?alt=media`;
      if (!url.startsWith(base()) && !url.startsWith('https://generativelanguage.googleapis.com/')) return { done: true, error: 'Unexpected video location.' };
      const v = await fetch(url, { headers: { 'x-goog-api-key': key() } });
      if (!v.ok) return { done: true, error: `Could not download the video (${v.status}).` };
      return { done: true, data: Buffer.from(await v.arrayBuffer()), mime: 'video/mp4' };
    }
    return { done: true, error: errorOf(j, 'No video was returned (it may have been blocked by safety filters).') };
  },
};
