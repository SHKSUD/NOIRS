// Milestone 4: assembling the cut. Uses the real ffmpeg (ffmpeg-static) on tiny clips.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { useThrowawayEnv, createSchema } from './helpers';

const env = useThrowawayEnv();
const { db } = await import('../lib/db');
const { generateShotFrame, shotWithRefs } = await import('../lib/storyboard');
const { startShotRender, pollShotRender, renderHash } = await import('../lib/render');
const { planCut, assembleCut } = await import('../lib/assemble');
const { saveFile } = await import('../lib/storage');

let projectId = '';
const ids: string[] = [];

async function renderToDone(id: string) {
  await startShotRender(id);
  for (let i = 0; i < 200; i++) {
    if ((await pollShotRender(id)).status !== 'rendering') return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error('render did not finish');
}

function durationOf(file: string): number {
  try { execFileSync(ffmpegPath!, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) {
    const m = String((e as { stderr?: string }).stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
  throw new Error('no duration');
}
const storagePath = (name: string) => path.join(process.env.GD_STORAGE_DIR!, name);

before(async () => {
  await createSchema(db);
  const p = await db.project.create({ data: { title: 'Cut test', script: 'x'.repeat(30) } });
  projectId = p.id;
  const s1 = await db.scene.create({ data: { projectId, order: 0, heading: 'EXT. ROOF - NIGHT' } });
  const s2 = await db.scene.create({ data: { projectId, order: 1, heading: 'INT. METRO - NIGHT' } });
  // Scene 2 is created first on purpose: the cut must follow scene order, not creation order.
  const specs = [
    { scene: s2, order: 0, description: 'Metro shot', durationSec: 2, dialogue: 'MEERA: Last one for me.' },
    { scene: s1, order: 0, description: 'Rooftop wide', durationSec: 3, dialogue: '' },
    { scene: s1, order: 1, description: 'Rooftop close', durationSec: 2.5, dialogue: '' },
  ];
  for (const s of specs) {
    const row = await db.shot.create({ data: { sceneId: s.scene.id, order: s.order, description: s.description, camera: 'Static', framing: 'Wide', mood: 'Quiet', durationSec: s.durationSec, dialogue: s.dialogue } });
    ids.push(row.id);
    await generateShotFrame(row.id);
  }
  // Render the metro shot and the rooftop wide; leave "Rooftop close" unrendered.
  await renderToDone(ids[0]);
  await renderToDone(ids[1]);
  // Replace the rooftop wide's mock clip with a real 2 s MP4 (no audio), as a real video model would return.
  const mp4 = path.join(env.tmp, 'real.mp4');
  execFileSync(ffmpegPath!, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2', '-pix_fmt', 'yuv420p', mp4]);
  const name = await saveFile('clip-realtest-0001.mp4', readFileSync(mp4));
  const shot = (await db.shot.findUnique({ where: { id: ids[1] }, ...shotWithRefs }))!;
  await db.shot.update({ where: { id: ids[1] }, data: { renderOutput: name, renderInputHash: renderHash(shot) } });
});

after(async () => { await db.$disconnect(); env.cleanup(); });

test('the plan follows scene order and flags unrendered shots', async () => {
  const plan = await planCut(projectId);
  assert.deepEqual(plan.items.map(i => i.description), ['Rooftop wide', 'Rooftop close', 'Metro shot']);
  assert.deepEqual(plan.items.map(i => i.kind), ['clip', 'skip', 'mock']);
  assert.equal(plan.items[1].reason, 'not rendered');
  assert.equal(plan.included, 2);
  assert.equal(plan.seconds, 5);
});

test('assembling makes one MP4 of the included shots, at their durations', async () => {
  const { state, reused } = await assembleCut(projectId);
  assert.equal(reused, false);
  assert.equal(state.fresh, true);
  const file = storagePath(state.url!.split('/').pop()!);
  assert.ok(existsSync(file));
  // 3 s (a 2 s real clip held to 3 s) + 2 s card = 5 s.
  assert.ok(Math.abs(durationOf(file) - 5) < 0.25, `duration ${durationOf(file)}`);
});

test('assembling again with the same clips reuses the cut (idempotent)', async () => {
  const before = (await db.project.findUnique({ where: { id: projectId } }))!;
  const { reused } = await assembleCut(projectId);
  assert.equal(reused, true);
  const afterRow = (await db.project.findUnique({ where: { id: projectId } }))!;
  assert.equal(afterRow.exportFile, before.exportFile);
  assert.equal(afterRow.exportedAt?.getTime(), before.exportedAt?.getTime());
});

test('rendering the missing shot makes the cut out of date; re-assembling includes it', async () => {
  const old = (await db.project.findUnique({ where: { id: projectId } }))!.exportFile!;
  await renderToDone(ids[2]);
  const plan = await planCut(projectId);
  assert.equal(plan.included, 3);
  const { state, reused } = await assembleCut(projectId);
  assert.equal(reused, false);
  assert.ok(Math.abs(durationOf(storagePath(state.url!.split('/').pop()!)) - 7.5) < 0.25);
  assert.equal(existsSync(storagePath(old)), false, 'old cut file is removed');
});

test('assembling never changes any shot', async () => {
  const before = JSON.stringify(await db.shot.findMany({ orderBy: { id: 'asc' } }));
  await db.project.update({ where: { id: projectId }, data: { exportHash: 'force-rebuild' } });
  await assembleCut(projectId);
  assert.equal(JSON.stringify(await db.shot.findMany({ orderBy: { id: 'asc' } })), before);
});
