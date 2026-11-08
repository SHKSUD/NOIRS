// Provider-neutral shapes. Every LLM provider returns a Breakdown; nothing else in the app knows which model made it.

export type ShotDraft = {
  description: string;
  camera: string;
  framing: string;
  mood: string;
  durationSec: number;
  dialogue: string;
  characters: string[]; // character names, matched to Breakdown.characters
};

export type SceneDraft = {
  heading: string;
  summary: string;
  shots: ShotDraft[];
};

export type CharacterDraft = { name: string; styleNote: string };

export type Breakdown = {
  scenes: SceneDraft[];
  characters: CharacterDraft[];
};

export interface LLMProvider {
  readonly name: string;
  breakdownScript(script: string): Promise<Breakdown>;
}

export const FRAMINGS = ['Extreme wide', 'Wide', 'Full', 'Medium', 'Medium close-up', 'Close-up', 'Extreme close-up', 'Over-the-shoulder', 'Insert'] as const;
export const CAMERAS = ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Tracking', 'Handheld', 'Crane', 'Zoom'] as const;

export const LIMITS = { scenes: 30, shotsPerScene: 40, text: 2000, short: 120, minDur: 0.5, maxDur: 60 } as const;
