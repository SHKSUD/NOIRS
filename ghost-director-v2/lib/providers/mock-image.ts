import { createHash } from 'node:crypto';
import type { FrameCharacter, FrameRequest, ImageProvider } from './image-types';

// Deterministic storyboard sketch (SVG). Each character gets a stable colour and badge derived from
// its name + reference image, so a locked reference is visibly the same in every frame.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hue = (seed: string) => parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 6), 16) % 360;
const colorOf = (c: FrameCharacter) =>
  `hsl(${hue(c.name + (c.reference ? createHash('sha256').update(c.reference.data).digest('hex') : ''))} 60% 40%)`;

function scaleFor(framing: string): number {
  const f = framing.toLowerCase();
  if (f.includes('extreme close')) return 3.2;
  if (f.includes('close')) return 2.3;
  if (f.includes('medium') || f.includes('shoulder')) return 1.4;
  if (f.includes('full')) return 1.0;
  if (f.includes('wide')) return 0.6;
  return 1.0;
}

function figure(x: number, s: number, color: string, label: string) {
  const ground = 330;
  const h = 150 * s;
  const head = 15 * s;
  const top = ground - h;
  return `<g stroke="#1b1b1b" stroke-width="${Math.max(2, 2.4 * Math.sqrt(s))}" stroke-linecap="round" fill="none">
  <circle cx="${x}" cy="${top + head}" r="${head}" fill="${color}" fill-opacity=".55"/>
  <path d="M${x} ${top + 2 * head} L${x} ${top + h * 0.62}"/>
  <path d="M${x - 32 * s} ${top + h * 0.45} L${x} ${top + h * 0.3} L${x + 32 * s} ${top + h * 0.45}"/>
  <path d="M${x} ${top + h * 0.62} L${x - 18 * s} ${ground} M${x} ${top + h * 0.62} L${x + 18 * s} ${ground}"/>
</g>
<text x="${x}" y="${Math.min(352, Math.max(24, top - 6))}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${color}" stroke="#f3efe6" stroke-width="3" paint-order="stroke">${esc(label)}</text>`;
}

export function mockFrameSvg(req: FrameRequest): string {
  const s = scaleFor(req.framing);
  const people = req.characters.slice(0, 4);
  const xs = people.map((_, i) => Math.round(((i + 1) * 640) / (people.length + 1)));
  const night = /night|dark/i.test(req.sceneHeading + req.mood);

  // Reference insets: the locked image for each character, top-right.
  const insets = people.map((c, i) => {
    const col = colorOf(c);
    const x = 640 - 58 * (i + 1);
    const img = c.reference
      ? `<image href="data:${c.reference.mime};base64,${c.reference.data.toString('base64')}" x="${x}" y="10" width="48" height="48" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${i})"/>`
      : `<rect x="${x}" y="10" width="48" height="48" fill="#ddd"/><text x="${x + 24}" y="40" text-anchor="middle" font-family="Arial" font-size="10" fill="#666">no ref</text>`;
    return `<clipPath id="c${i}"><rect x="${x}" y="10" width="48" height="48" rx="6"/></clipPath>${img}<rect x="${x}" y="10" width="48" height="48" rx="6" fill="none" stroke="${col}" stroke-width="3"/>`;
  }).join('');

  const figs = people.map((c, i) => figure(xs[i], s, colorOf(c), c.name)).join('');
  const lines = Array.from({ length: 11 }, (_, i) => `<line x1="${i * 64}" y1="360" x2="320" y2="170" stroke="#9a9a9a" stroke-width="1"/>`).join('');
  const moving = !/static/i.test(req.camera);
  const arrow = moving ? `<path d="M470 300 L560 300 M545 290 L560 300 L545 310" stroke="#c0392b" stroke-width="4" fill="none" stroke-linecap="round"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="1280" height="720">
<rect width="640" height="360" fill="${night ? '#dcd8cf' : '#f3efe6'}"/>
<line x1="0" y1="170" x2="640" y2="170" stroke="#555" stroke-width="2"/>${lines}
${figs}${insets}${arrow}
<rect x="3" y="3" width="634" height="354" fill="none" stroke="#222" stroke-width="3"/>
<text x="14" y="28" font-family="Courier New,monospace" font-size="16" font-weight="700" fill="#222">${esc(req.shotNumber)}</text>
<text x="14" y="348" font-family="Courier New,monospace" font-size="12" fill="#333">${esc(`${req.framing || 'Framing?'} · ${req.camera || 'Camera?'} · ${req.mood || ''}`.slice(0, 80))}</text>
<text x="626" y="348" text-anchor="end" font-family="Courier New,monospace" font-size="11" fill="#777">MOCK FRAME</text>
</svg>`;
}

export const mockImage: ImageProvider = {
  name: 'mock',
  async generateFrame(req) {
    await new Promise(r => setTimeout(r, 250));
    return { data: Buffer.from(mockFrameSvg(req)), mime: 'image/svg+xml' };
  },
};
