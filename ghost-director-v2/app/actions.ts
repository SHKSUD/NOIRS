'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getLLM, type Breakdown } from '@/lib/providers';
import { clampDuration } from '@/lib/providers/normalize';
import { LIMITS } from '@/lib/providers/types';

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
  await db.$transaction(async tx => {
    await tx.project.update({ where: { id: projectId }, data: input });
    await tx.scene.deleteMany({ where: { projectId } });
    await tx.character.deleteMany({ where: { projectId } });
    await writeBreakdown(tx, projectId, bd);
  });
  revalidatePath(`/projects/${projectId}`, 'layout');
  redirect(`/projects/${projectId}/shots`);
}

export type ShotPatch = Partial<{
  description: string; camera: string; framing: string; mood: string; durationSec: number; dialogue: string; characterIds: string[];
}>;

// Saves edits to ONE shot. Never touches other shots.
export async function updateShot(shotId: string, patch: ShotPatch): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
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
    const row = await db.shot.update({ where: { id: shotId }, data, select: { updatedAt: true } });
    return { ok: true, updatedAt: row.updatedAt.toISOString() };
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
