import { randomUUID } from 'node:crypto';
import type { PollResult, VideoProvider, VideoRequest } from './video-types';

// Mock "clip": an animated SVG built from the storyboard frame, moving the way the shot's camera moves,
// with the dialogue as a subtitle and a progress bar for the shot's duration. No cost, no dependencies.
// Jobs finish after a short delay so the app's start/poll flow is exercised exactly as with a real model.

const RENDER_MS = Number(process.env.GD_MOCK_RENDER_MS || 2500);
const jobs = ((globalThis as unknown as { __gdMockVideo?: Map<string, { req: VideoRequest; readyAt: number }> }).__gdMockVideo ??= new Map());

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function cameraKeyframes(camera: string): string {
  const c = camera.toLowerCase();
  if (c.includes('dolly out')) return 'from{transform:scale(1.25)}to{transform:scale(1)}';
  if (c.includes('dolly') || c.includes('zoom')) return 'from{transform:scale(1)}to{transform:scale(1.25)}';
  if (c.includes('pan') || c.includes('track')) return 'from{transform:scale(1.15) translateX(28px)}to{transform:scale(1.15) translateX(-28px)}';
  if (c.includes('tilt')) return 'from{transform:scale(1.15) translateY(20px)}to{transform:scale(1.15) translateY(-20px)}';
  if (c.includes('crane')) return 'from{transform:scale(1.2) translateY(24px)}to{transform:scale(1.05) translateY(-10px)}';
  if (c.includes('handheld')) return '0%{transform:scale(1.08) translate(0,0)}25%{transform:scale(1.08) translate(3px,-2px)}50%{transform:scale(1.08) translate(-2px,2px)}75%{transform:scale(1.08) translate(2px,1px)}100%{transform:scale(1.08) translate(0,0)}';
  return 'from{transform:scale(1)}to{transform:scale(1)}';
}

// Wraps text into at most 2 subtitle lines.
function subtitle(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 52) { if (lines.length === 2) { lines[1] += '…'; break; } lines.push(''); }
    lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  return lines.filter(Boolean);
}

export function mockClipSvg(req: VideoRequest): string {
  const d = Math.max(0.5, req.durationSec);
  const frame = `data:${req.frame.mime};base64,${req.frame.data.toString('base64')}`;
  const subs = req.dialogue ? subtitle(req.dialogue) : [];
  const subY = subs.length === 2 ? 304 : 322;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="1280" height="720">
<style>
.cam{transform-origin:320px 180px;animation:cam ${d}s linear infinite}
@keyframes cam{${cameraKeyframes(req.camera)}}
.bar{animation:bar ${d}s linear infinite}
@keyframes bar{from{width:0}to{width:640px}}
</style>
<rect width="640" height="360" fill="#000"/>
<g class="cam"><image href="${frame}" x="0" y="0" width="640" height="360" preserveAspectRatio="xMidYMid slice"/></g>
${subs.map((l, i) => `<text x="320" y="${subY + i * 20}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(l)}</text>`).join('')}
<rect class="bar" x="0" y="356" height="4" fill="#e9b75a"/>
<rect x="8" y="8" width="132" height="20" rx="4" fill="#000" fill-opacity=".6"/>
<text x="16" y="22" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#e9b75a">MOCK CLIP · ${esc(req.shotNumber)} · ${d}s</text>
</svg>`;
}

export const mockVideo: VideoProvider = {
  name: 'mock',
  owns: id => id.startsWith('mock-'),
  async start(req) {
    const jobId = `mock-${randomUUID()}`;
    jobs.set(jobId, { req, readyAt: Date.now() + RENDER_MS });
    return { jobId };
  },
  async poll(jobId): Promise<PollResult> {
    const job = jobs.get(jobId);
    if (!job) return { done: true, error: 'The render job was lost (the server restarted). Render again.' };
    if (Date.now() < job.readyAt) return { done: false };
    jobs.delete(jobId);
    return { done: true, data: Buffer.from(mockClipSvg(job.req)), mime: 'image/svg+xml' };
  },
};
