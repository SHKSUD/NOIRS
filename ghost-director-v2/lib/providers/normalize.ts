import { type Breakdown, LIMITS, type SceneDraft, type ShotDraft } from './types';

const str = (v: unknown, max: number = LIMITS.text) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
export const clampDuration = (n: number) => Math.round(Math.min(LIMITS.maxDur, Math.max(LIMITS.minDur, n)) * 10) / 10;

// Turns untrusted model output into a valid Breakdown (or throws if nothing usable came back).
export function normalizeBreakdown(raw: unknown): Breakdown {
  const r = (raw ?? {}) as { scenes?: unknown; characters?: unknown };
  const scenes: SceneDraft[] = (Array.isArray(r.scenes) ? r.scenes : []).slice(0, LIMITS.scenes).map((s, i) => {
    const sc = (s ?? {}) as Record<string, unknown>;
    const shots: ShotDraft[] = (Array.isArray(sc.shots) ? sc.shots : []).slice(0, LIMITS.shotsPerScene).map(x => {
      const sh = (x ?? {}) as Record<string, unknown>;
      return {
        description: str(sh.description) || 'Untitled shot',
        camera: str(sh.camera, LIMITS.short),
        framing: str(sh.framing, LIMITS.short),
        mood: str(sh.mood, LIMITS.short),
        durationSec: clampDuration(num(sh.durationSec ?? sh.duration, 3)),
        dialogue: str(sh.dialogue),
        characters: (Array.isArray(sh.characters) ? sh.characters : []).map(c => str(c, LIMITS.short)).filter(Boolean),
      };
    });
    return { heading: str(sc.heading, LIMITS.short) || `SCENE ${i + 1}`, summary: str(sc.summary), shots };
  }).filter(s => s.shots.length > 0);

  if (!scenes.length) throw new Error('The breakdown came back empty. Try a longer script.');

  const names = new Map<string, { name: string; styleNote: string }>();
  for (const c of Array.isArray(r.characters) ? r.characters : []) {
    const cc = (c ?? {}) as Record<string, unknown>;
    const name = str(cc.name, LIMITS.short);
    if (name) names.set(name.toUpperCase(), { name, styleNote: str(cc.styleNote) });
  }
  // Any character referenced by a shot must exist.
  for (const s of scenes) for (const sh of s.shots) for (const n of sh.characters)
    if (!names.has(n.toUpperCase())) names.set(n.toUpperCase(), { name: n, styleNote: '' });

  return { scenes, characters: [...names.values()] };
}
