'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getLLM, type Breakdown } from '@/lib/providers';
import { clampDuration } from '@/lib/providers/normalize';
import { LIMITS } from '@/lib/providers/types';
import { frameState, generateShotFrame, shotWithRefs, type FrameState } from '@/lib/storyboard';
import { EXT, fileUrl, removeFile, saveFile, sha } from '@/lib/storage';
import { pollShotRender, renderState, startShotRender, type RenderState } from '@/lib/render';

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_SCRIPT = 50_000;
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function readScript(fd: FormData): { title: string; script: string } | { error: string } {
  const title = String(fd.get('title') || '').trim().slice(0, LIMITS.short) || 'Untitled film';
  const script = String(fd.get('script') || '').trim();
  if (script.length < 20) return { error: 'Paste a script of at least a few lines.' };
  if (script.length > MAX_SCRIPT) return { error: `Script is too long (max ${MAX_SCRIPT.toLocaleString()} characters).` };
  return { title, script };
}

// Writes a breakdown's characters, scenes and shots under a project.
async function writeBreakdown(tx: Prisma.TransactionClient, projectId: string, bd: Breakdown) {
  const ids = new Map<string, string>();
  for (const c of bd.characters) {
    const row = await tx.character.create({ data: { projectId, name: c.name, styleNote: c.styleNote } });
    ids.set(c.name.toUpperCase(), row.id);
  }
  for (const [i, s] of bd.scenes.entries()) {
    await tx.scene.create({
      data: {
        projectId, order: i, heading: s.heading, summary: s.summary,
        shots: {
          create: s.shots.map((sh, j) => ({
            order: j, description: sh.description, camera: sh.camera, framing: sh.framing, mood: sh.mood,
            durationSec: sh.durationSec, dialogue: sh.dialogue,
            characters: {
              create: [...new Set(sh.characters.map(n => ids.get(n.toUpperCase())).filter((x): x is string => !!x))]
                .map(characterId => ({ characterId })),
            },
          })),
        },
      },
    });
  }
}

export async function createProject(_: FormState, fd: FormData): Promise<FormState> {
  const input = readScript(fd);
  if ('error' in input) return input;
  let bd: Breakdown;
  try { bd = await getLLM().breakdownScript(input.script); } catch (e) { return { error: 'Breakdown failed: ' + message(e) }; }
  const project = await db.$transaction(async tx => {
    const p = await tx.project.create({ data: input });
    await writeBreakdown(tx, p.id, bd);
    return p;
  });
  revalidatePath('/');
  redirect(`/projects/${project.id}/shots`);
}

export async function saveScript(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const input = readScript(fd);
  if ('error' in input) return input;
  await db.project.update({ where: { id: projectId }, data: input });
  revalidatePath(`/projects/${projectId}`, 'layout');
  return { ok: 'Script saved. Shots were not changed.' };
}

// Replaces ALL scenes, shots and characters with a fresh breakdown of the script.
export async function rerunBreakdown(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const input = readScript(fd);
  if ('error' in input) return input;
  let bd: Breakdown;
  try { bd = await getLLM().breakdownScript(input.script); } catch (e) { return { error: 'Breakdown failed: ' + message(e) }; }
  const oldFrames = await db.shot.findMany({ where: { scene: { projectId }, storyboardImage: { not: null } }, select: { storyboardImage: true } });
  await db.$transaction(async tx => {
    await tx.project.update({ where: { id: projectId }, data: input });
    await tx.scene.deleteMany({ where: { projectId } });
    await tx.character.deleteMany({ where: { projectId } });
    await writeBreakdown(tx, projectId, bd);
  });
  await Promise.all(oldFrames.map(f => removeFile(f.storyboardImage)));
  revalidatePath(`/projects/${projectId}`, 'layout');
  redirect(`/projects/${projectId}/shots`);
}

export type ShotPatch = Partial<{
  description: string; camera: string; framing: string; mood: string; durationSec: number; dialogue: string; characterIds: string[];
}>;

// Saves edits to ONE shot. Never touches other shots. Returns the shot's frame state (it may now be out of date).
export async function updateShot(shotId: string, patch: ShotPatch): Promise<{ ok: true; updatedAt: string; frame: FrameState; render: RenderState } | { ok: false; error: string }> {
  try {
    const shot = await db.shot.findUnique({ where: { id: shotId }, select: { scene: { select: { projectId: true } } } });
    if (!shot) return { ok: false, error: 'Shot not found.' };
    const data: Prisma.ShotUpdateInput = {};
    for (const k of ['description', 'camera', 'framing', 'mood', 'dialogue'] as const) {
      if (typeof patch[k] === 'string') data[k] = patch[k]!.slice(0, k === 'description' || k === 'dialogue' ? LIMITS.text : LIMITS.short);
    }
    if (patch.durationSec !== undefined) {
      const n = Number(patch.durationSec);
      if (!Number.isFinite(n)) return { ok: false, error: 'Duration must be a number.' };
      data.durationSec = clampDuration(n);
    }
    if (Array.isArray(patch.characterIds)) {
      const valid = await db.character.findMany({ where: { id: { in: patch.characterIds }, projectId: shot.scene.projectId }, select: { id: true } });
      data.characters = { deleteMany: {}, create: valid.map(c => ({ characterId: c.id })) };
    }
    const row = await db.shot.update({ where: { id: shotId }, data, ...shotWithRefs });
    return { ok: true, updatedAt: row.updatedAt.toISOString(), frame: frameState(row), render: renderState(row) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateScene(sceneId: string, patch: { heading?: string; summary?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const data: Prisma.SceneUpdateInput = {};
    if (typeof patch.heading === 'string') data.heading = patch.heading.trim().slice(0, LIMITS.short) || 'UNTITLED SCENE';
    if (typeof patch.summary === 'string') data.summary = patch.summary.slice(0, LIMITS.text);
    await db.scene.update({ where: { id: sceneId }, data });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ===== Milestone 2: storyboard frames + locked character references =====

export async function generateFrame(shotId: string, force = false): Promise<{ ok: true; frame: FrameState; skipped: boolean } | { ok: false; error: string }> {
  try {
    const { skipped, ...frame } = await generateShotFrame(shotId, force);
    return { ok: true, frame, skipped };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateCharacter(characterId: string, patch: { styleNote?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof patch.styleNote !== 'string') return { ok: true };
    await db.character.update({ where: { id: characterId }, data: { styleNote: patch.styleNote.slice(0, LIMITS.text) } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

const MAX_REF_BYTES = 2 * 1024 * 1024;

// Detects the real image type from the file's first bytes (the browser's claimed type is not trusted).
function sniff(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function dropIfUnused(name: string | null) {
  if (name && !(await db.character.count({ where: { referenceImage: name } }))) await removeFile(name);
}

// Sets (or replaces) a character's locked reference. Only shots featuring this character go out of date.
// Validates and stores an uploaded reference image. Returns its file name, or an error message.
async function storeReference(file: FormDataEntryValue | null): Promise<{ name: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' };
  if (file.size > MAX_REF_BYTES) return { error: 'Image is too large (max 2 MB).' };
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniff(data);
  if (!mime) return { error: 'Use a PNG, JPEG or WebP image.' };
  return { name: await saveFile(`ref-${sha(data)}.${EXT[mime]}`, data) };
}

export async function createCharacter(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  try {
    const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.short);
    if (!name) return { error: 'Give the character a name.' };
    const taken = await db.character.findMany({ where: { projectId }, select: { name: true } });
    if (taken.some(c => c.name.toUpperCase() === name.toUpperCase())) return { error: `${name} already exists.` };
    let referenceImage: string | null = null;
    const file = fd.get('file');
    if (file instanceof File && file.size > 0) {
      const stored = await storeReference(file);
      if ('error' in stored) return { error: stored.error };
      referenceImage = stored.name;
    }
    await db.character.create({ data: { projectId, name, styleNote: String(fd.get('styleNote') || '').slice(0, LIMITS.text), referenceImage } });
    revalidatePath(`/projects/${projectId}`, 'layout');
    return { ok: `${name} added. Add them to shots from the shot list.` };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function setCharacterReference(characterId: string, fd: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const stored = await storeReference(fd.get('file'));
    if ('error' in stored) return { ok: false, error: stored.error };
    const name = stored.name;
    const before = await db.character.findUnique({ where: { id: characterId }, select: { referenceImage: true, projectId: true } });
    if (!before) return { ok: false, error: 'Character not found.' };
    await db.character.update({ where: { id: characterId }, data: { referenceImage: name } });
    if (before.referenceImage !== name) await dropIfUnused(before.referenceImage);
    revalidatePath(`/projects/${before.projectId}`, 'layout');
    return { ok: true, url: fileUrl(name)! };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function removeCharacterReference(characterId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const before = await db.character.findUnique({ where: { id: characterId }, select: { referenceImage: true, projectId: true } });
    if (!before) return { ok: false, error: 'Character not found.' };
    await db.character.update({ where: { id: characterId }, data: { referenceImage: null } });
    await dropIfUnused(before.referenceImage);
    revalidatePath(`/projects/${before.projectId}`, 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ===== Milestone 3: per-shot render =====

export async function startRender(shotId: string, force = false): Promise<{ ok: true; render: RenderState; skipped: boolean } | { ok: false; error: string }> {
  try {
    const { skipped, ...render } = await startShotRender(shotId, force);
    return { ok: true, render, skipped };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function pollRender(shotId: string): Promise<{ ok: true; render: RenderState } | { ok: false; error: string }> {
  try {
    return { ok: true, render: await pollShotRender(shotId) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
