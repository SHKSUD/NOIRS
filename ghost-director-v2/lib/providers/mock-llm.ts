import { normalizeBreakdown } from './normalize';
import { Breakdown, LLMProvider } from './types';

// Deterministic, offline breakdown: parses screenplay structure with simple rules.
// Same script in -> same shots out, so tests and demos are repeatable.

const HEADING = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.|EXT\.)\s/i;
const SPEAKER_INLINE = /^([A-Z][A-Z .'-]{1,30})(\s*\([^)]*\))?\s*:\s*(.+)$/; // ARJUN (O.S.): line
const SPEAKER_CUE = /^([A-Z][A-Z .'-]{1,30})(\s*\([^)]*\))?$/; // ARJUN (V.O.)   [dialogue on next line]
const INTRO = /\b([A-Z][A-Z'-]{2,})\s*\((?:[^)]*\d[^)]*|late|early|mid)[^)]*\)/g; // ARJUN (30s)
const MOVES = /\b(walks?|runs?|steps?|turns?|enters?|exits?|crosses|rushes|follows?|drives?|climbs?)\b/i;

type Beat = { kind: 'action' | 'dialogue'; text: string; speaker?: string };

function moodOf(text: string): string {
  const t = text.toLowerCase();
  if (/rain|storm|thunder|dark|night/.test(t)) return 'Moody, tense';
  if (/laugh|smile|sun|bright/.test(t)) return 'Warm, light';
  if (/cry|tears|alone|empty|last/.test(t)) return 'Melancholy';
  if (/run|chase|shout|gun|crash/.test(t)) return 'Urgent';
  return 'Quiet';
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function splitScenes(script: string): { heading: string; lines: string[] }[] {
  const out: { heading: string; lines: string[] }[] = [];
  for (const raw of script.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (HEADING.test(line)) { out.push({ heading: line.toUpperCase(), lines: [] }); continue; }
    if (!out.length) out.push({ heading: 'SCENE 1', lines: [] });
    out[out.length - 1].lines.push(line);
  }
  return out.filter(s => s.lines.some(Boolean));
}

function beats(lines: string[]): Beat[] {
  const out: Beat[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ kind: 'action', text: para.join(' ') }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) { flush(); continue; }
    const inline = l.match(SPEAKER_INLINE);
    if (inline) { flush(); out.push({ kind: 'dialogue', speaker: inline[1].trim(), text: inline[3].trim() }); continue; }
    const cue = l.match(SPEAKER_CUE);
    if (cue && lines[i + 1] && !SPEAKER_CUE.test(lines[i + 1])) {
      flush();
      const said: string[] = [];
      while (lines[i + 1]) said.push(lines[++i]);
      out.push({ kind: 'dialogue', speaker: cue[1].trim(), text: said.join(' ') });
      continue;
    }
    // A single action line is its own beat, so each visual moment becomes a shot.
    para.push(l); flush();
  }
  flush();
  return out;
}

export function mockBreakdown(script: string): Breakdown {
  const known = new Set<string>();
  for (const m of script.matchAll(INTRO)) known.add(m[1]);
  const scenes = splitScenes(script).map(sc => {
    const bs = beats(sc.lines);
    bs.forEach(b => b.speaker && known.add(b.speaker));
    const sceneText = bs.map(b => b.text).join(' ');
    const shots = bs.map((b, i) => {
      const inShot = [...known].filter(n => new RegExp(`\\b${n}\\b`, 'i').test(b.text) || n === b.speaker);
      if (b.kind === 'dialogue') {
        return {
          description: `${b.speaker} speaks.`,
          camera: 'Static',
          framing: i % 2 ? 'Over-the-shoulder' : 'Close-up',
          mood: moodOf(sceneText),
          durationSec: Math.max(2, Math.round(words(b.text) / 2.5) + 1),
          dialogue: `${b.speaker}: ${b.text}`,
          characters: inShot,
        };
      }
      return {
        description: b.text,
        camera: MOVES.test(b.text) ? 'Tracking' : i === 0 ? 'Static' : 'Pan',
        framing: i === 0 ? 'Wide' : inShot.length > 1 ? 'Medium' : inShot.length === 1 ? 'Medium close-up' : 'Full',
        mood: moodOf(b.text + ' ' + sceneText),
        durationSec: Math.min(8, Math.max(2, Math.round(words(b.text) / 2.5))),
        dialogue: '',
        characters: inShot,
      };
    });
    return { heading: sc.heading, summary: (bs.find(b => b.kind === 'action')?.text || '').slice(0, 160), shots };
  });
  return normalizeBreakdown({ scenes, characters: [...known].map(name => ({ name, styleNote: '' })) });
}

export const mockLLM: LLMProvider = {
  name: 'mock',
  async breakdownScript(script) {
    await new Promise(r => setTimeout(r, 300)); // feel like a network call
    return mockBreakdown(script);
  },
};
