// Dev-only fake AI so the full UI flow runs without API keys.
// Active when MOCK_AI=1, or in `next dev` when the service's key is missing. Never in production.
export const isMock = key =>
  process.env.NODE_ENV !== 'production' && (process.env.MOCK_AI === '1' || !process.env[key]);

const wait = ms => new Promise(r => setTimeout(r, ms));
const pick = (a, i) => a[i % a.length];

const SCENE = `EXT. METRO PLATFORM – NIGHT

Rajiv Chowk. The last train hums in. Fluorescent light flickers over empty benches.

MEERA (late 20s), soaked denim jacket, clutches a single suitcase.
ARJUN (30s), long dark raincoat, watches her from the far pillar.

The doors open. Both step in. Only two passengers.

ARJUN: Last one tonight.
MEERA: Last one for me.

He looks at the suitcase. She looks out the window.
Delhi's lights smear past the glass like wet paint.

The train enters the tunnel. Darkness. Only their reflections remain.`;

const TYPES = ['Establishing', 'Wide', 'Medium', 'Over-the-shoulder', 'Close-up', 'Extreme close-up'];
const CAMS = ['static', 'dolly in', 'pan', 'handheld', 'crane'];
const LENS = ['24mm', '35mm', '50mm', '85mm', '100mm'];
const BEATS = [
  ['The empty metro platform under flickering light.', '', ''],
  ['Meera waits with her suitcase at the platform edge.', '', ''],
  ['Arjun watches her from behind a pillar.', '', ''],
  ['Both step into the empty carriage.', 'Last one tonight.', 'ARJUN'],
  ['Meera turns, eyes on the dark window.', 'Last one for me.', 'MEERA'],
  ['Arjun glances down at the suitcase.', '', ''],
  ['City lights smear past the glass.', '', ''],
  ['Their reflections hang in the black window as the tunnel swallows the train.', '', ''],
];

function shots(n) {
  return Array.from({ length: n }, (_, i) => {
    const [action, dialogue, speaker] = pick(BEATS, i);
    return {
      n: i + 1, type: pick(TYPES, i), duration: 3 + (i % 3), action, dialogue, speaker,
      camera: pick(CAMS, i), lens: pick(LENS, i), mood: pick(['lonely', 'tense', 'tender', 'melancholy'], i),
      style_note: '[MOCK] Symmetrical framing isolates the character in the centre of the frame.',
      lesson: '[MOCK] Distance from the camera sets emotional distance: wide shots isolate, close-ups invite empathy.',
      characters: i % 3 === 0 ? 0 : 1 + (i % 2), subject_x: 0.3 + 0.1 * (i % 5), light_x: 0.7,
    };
  });
}

function person(x, y, s) {
  return `<g stroke="#111" stroke-linecap="round" fill="none" stroke-width="3">
<circle cx="${x}" cy="${y}" r="${14 * s}" fill="#ddd"/>
<path d="M${x} ${y + 14 * s} L${x} ${y + 80 * s} M${x - 30 * s} ${y + 40 * s} L${x} ${y + 25 * s} L${x + 30 * s} ${y + 40 * s} M${x} ${y + 80 * s} L${x - 20 * s} ${y + 130 * s} M${x} ${y + 80 * s} L${x + 20 * s} ${y + 130 * s}"/></g>`;
}

function sketch(prompt) {
  const type = (prompt.match(/shot type exactly \(([^,]+)/) || [])[1] || 'Wide';
  const n = Math.min(3, +((prompt.match(/Characters visible: (\d+)/) || [])[1] || 1));
  const close = /close/i.test(type);
  const s = close ? 2.2 : /medium|shoulder/i.test(type) ? 1.3 : 0.8;
  const y = close ? 80 : 360 - 140 * s - 30;
  let lines = '';
  for (let i = 0; i < 12; i++) lines += `<line x1="${i * 60}" y1="360" x2="320" y2="150" stroke="#888" stroke-width="1"/>`;
  let ppl = '';
  for (let i = 0; i < n; i++) ppl += person(180 + i * (280 / Math.max(1, n - 1 || 1)), y, s);
  return `<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
<line x1="0" y1="150" x2="640" y2="150" stroke="#444" stroke-width="2"/>${lines}
<rect x="40" y="40" width="40" height="110" fill="#bbb" stroke="#444" stroke-width="2"/>
<rect x="560" y="40" width="40" height="110" fill="#bbb" stroke="#444" stroke-width="2"/>
${ppl}
<path d="M520 300 L600 300 M585 290 L600 300 L585 310" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
}

export async function mockClaude(input) {
  const p = typeof input === 'string' ? input : JSON.stringify(input);
  await wait(400);
  if (/You are a screenwriter/.test(p)) return SCENE;
  if (/Break this script into at most/.test(p)) {
    const n = Math.max(1, Math.min(12, +((p.match(/at most (\d+) shots/) || [])[1] || 6)));
    return JSON.stringify({ palette: ['#1b2440', '#3a4a6b', '#0b0d14', '#f2c46d'], shots: shots(n) });
  }
  if (/storyboard artist\. Draw ONE storyboard panel/.test(p)) return sketch(p);
  if (/strict film critic/.test(p))
    return JSON.stringify({ score: 7, strengths: '[MOCK] Strong use of isolation and symmetry.', missing: '[MOCK] Could push colour contrast harder.' });
  if (/You are a script doctor/.test(p)) {
    const scene = (p.split('Scene:\n')[1] || SCENE).trim();
    return JSON.stringify({ script: scene + '\n\n(MOCK: script doctor pass)', notes: ['[MOCK] Tightened dialogue', '[MOCK] Added a visual final image', '[MOCK] Cut stated emotion'] });
  }
  if (/Rewrite this single storyboard shot/.test(p)) {
    const j = JSON.parse(p.match(/\{[\s\S]*\}/)[0]);
    return JSON.stringify({ ...j, camera: 'crane', action: '[MOCK regen] ' + j.action });
  }
  return '[MOCK] Claude reply. Add ANTHROPIC_API_KEY to .env.local for real output.';
}

// In-memory project store for dev (lost on server restart).
const store = (globalThis.__gdMockProjects ||= new Map());
export const mockProjects = {
  list: d => [...store.values()].filter(r => r.device === d).sort((a, b) => b.at - a.at).map(r => r.data),
  save: (d, id, data) => store.set(d + ':' + id, { device: d, at: Date.now(), data }),
};
