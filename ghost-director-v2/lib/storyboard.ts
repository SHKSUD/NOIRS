import type { Prisma } from '@prisma/client';
import { db } from './db';
import { getImage } from './providers';
import { EXT, fileUrl, readStored, removeFile, saveFile, sha } from './storage';

// Per-shot storyboard frames.
// A frame is identified by the hash of everything that shapes it: the shot's visual fields, its scene heading,
// and each character's name, style note and locked reference. Same inputs => same hash => nothing to do.
// Generating one shot only ever reads and writes that shot's row and its own frame file.

const PROMPT_VERSION = 1; // bump when the frame prompt changes, to mark every frame out of date

export const shotWithRefs = {
  include: {
    scene: { select: { heading: true, order: true, project: { select: { renderQuality: true } } } },
    characters: { include: { character: { select: { name: true, styleNote: true, referenceImage: true } } } },
  },
} satisfies Prisma.ShotDefaultArgs;
export type ShotWithRefs = Prisma.ShotGetPayload<typeof shotWithRefs>;

export function frameHash(shot: ShotWithRefs): string {
  const inputs = {
    v: PROMPT_VERSION,
    provider: getImage().name,
    scene: shot.scene.heading,
    description: shot.description,
    framing: shot.framing,
    camera: shot.camera,
    mood: shot.mood,
    characters: shot.characters
      .map(c => ({ name: c.character.name, styleNote: c.character.styleNote, ref: c.character.referenceImage }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return sha(JSON.stringify(inputs), 32);
}

export type FrameState = { url: string | null; status: string; stale: boolean; error: string | null };

export function frameState(shot: ShotWithRefs): FrameState {
  const has = !!shot.storyboardImage;
  return {
    url: fileUrl(shot.storyboardImage),
    status: shot.storyboardStatus,
    stale: has && shot.storyboardInputHash !== frameHash(shot),
    error: shot.storyboardError,
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function generateShotFrame(shotId: string, force = false): Promise<FrameState & { skipped: boolean }> {
  const shot = await db.shot.findUnique({ where: { id: shotId }, ...shotWithRefs });
  if (!shot) throw new Error('Shot not found.');
  const hash = frameHash(shot);

  // Idempotent: an up-to-date frame is never regenerated unless explicitly forced.
  if (!force && shot.storyboardImage && shot.storyboardInputHash === hash) return { ...frameState(shot), skipped: true };

  // Claim the shot so two clicks don't generate twice. A claim older than 2 minutes counts as abandoned.
  const claimed = await db.shot.updateMany({
    where: { id: shotId, OR: [{ storyboardStatus: { not: 'generating' } }, { updatedAt: { lt: new Date(Date.now() - 120_000) } }] },
    data: { storyboardStatus: 'generating', storyboardError: null },
  });
  if (!claimed.count) throw new Error('This frame is already being generated.');

  try {
    const characters = await Promise.all(shot.characters.map(async c => ({
      name: c.character.name,
      styleNote: c.character.styleNote,
      reference: c.character.referenceImage ? await readStored(c.character.referenceImage) : null,
    })));
    const img = await getImage().generateFrame({
      shotNumber: `${shot.scene.order + 1}.${shot.order + 1}`,
      sceneHeading: shot.scene.heading,
      description: shot.description,
      framing: shot.framing,
      camera: shot.camera,
      mood: shot.mood,
      characters,
    });
    const ext = EXT[img.mime];
    if (!ext) throw new Error(`Unsupported image type: ${img.mime}`);
    // Named by the image bytes, so a regenerated image always gets a new URL (files are cached as immutable).
    const name = `frame-${shotId}-${sha(img.data)}.${ext}`;
    await saveFile(name, img.data);
    const updated = await db.shot.update({
      where: { id: shotId },
      data: { storyboardImage: name, storyboardStatus: 'done', storyboardInputHash: hash, storyboardError: null },
      ...shotWithRefs,
    });
    if (shot.storyboardImage && shot.storyboardImage !== name) await removeFile(shot.storyboardImage);
    return { ...frameState(updated), skipped: false };
  } catch (e) {
    // Keep the previous frame (if any); just record the error.
    const failed = await db.shot.update({
      where: { id: shotId },
      data: { storyboardStatus: shot.storyboardImage ? 'done' : 'failed', storyboardError: message(e).slice(0, 500) },
      ...shotWithRefs,
    });
    return { ...frameState(failed), skipped: false };
  }
}
