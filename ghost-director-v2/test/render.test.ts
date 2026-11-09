// Proves the core claim: a creator can fix one shot without redoing the rest.
// Runs against a throwaway SQLite database and storage folder, with the mock image and video providers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useThrowawayEnv, createSchema } from './helpers';

const env = useThrowawayEnv();

// Imported after the env is set, so they use the throwaway DB/storage.
const { db } = await import('../lib/db');
const { generateShotFrame } = await import('../lib/storyboard');
const { startShotRender, pollShotRender, renderState } = await import('../lib/render');
const { shotWithRefs } = await import('../lib/storyboard');

const ids: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };

async function renderToDone(id: string, force = false) {
  await startShotRender(id, force);
  for (let i = 0; i < 200; i++) {
    const s = await pollShotRender(id);
    if (s.status !== 'rendering') return s;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error('render did not finish');
}

// Full row + the bytes of its frame and clip, for every shot.
async function snapshot() {
  const rows = await db.shot.findMany({ orderBy: { id: 'asc' } });
  const read = (name: string | null) => (name ? readFileSync(path.join(process.env.GD_STORAGE_DIR!, name)).toString('base64') : null);
  return Object.fromEntries(rows.map(r => [r.id, JSON.stringify({ ...r, frameBytes: read(r.storyboardImage), clipBytes: read(r.renderOutput) })]));
}

function assertOnlyChanged(before: Record<string, string>, afterSnap: Record<string, string>, changed: string[]) {
  for (const id of Object.keys(before)) {
    if (changed.includes(id)) assert.notEqual(afterSnap[id], before[id], `shot ${id} should have changed`);
    else assert.equal(afterSnap[id], before[id], `shot ${id} must not change`);
  }
}

before(async () => {
  await createSchema(db);

  const p = await db.project.create({ data: { title: 'Test', script: 'x'.repeat(30) } });
  const meera = await db.character.create({ data: { projectId: p.id, name: 'MEERA', styleNote: 'denim jacket' } });
  const scene = await db.scene.create({ data: { projectId: p.id, order: 0, heading: 'EXT. ROOFTOP - NIGHT' } });
  for (const [i, k] of (['A', 'B', 'C'] as const).entries()) {
    const s = await db.shot.create({
      data: {
        sceneId: scene.id, order: i, description: `Shot ${k}`, camera: 'Static', framing: 'Wide', mood: 'Quiet', durationSec: 3,
        characters: k === 'B' ? { create: [{ characterId: meera.id }] } : undefined,
      },
    });
    ids[k] = s.id;
  }
  for (const id of Object.values(ids)) {
    await generateShotFrame(id);
    const r = await renderToDone(id);
    assert.equal(r.status, 'done');
  }
});

after(async () => {
  await db.$disconnect();
  env.cleanup();
});

test('re-rendering an edited shot changes that shot only', async () => {
  const before = await snapshot();
  await db.shot.update({ where: { id: ids.B }, data: { description: 'Shot B, fixed: she turns away' } });
  await generateShotFrame(ids.B); // the frame is out of date after the edit
  const r = await renderToDone(ids.B);
  assert.equal(r.status, 'done');
  assert.equal(r.stale, false);
  assertOnlyChanged(before, await snapshot(), [ids.B]);
});

test('forcing a re-render of an up-to-date shot changes that shot only', async () => {
  const before = await snapshot();
  await new Promise(r => setTimeout(r, 5)); // so renderStartedAt differs
  await renderToDone(ids.A, true);
  assertOnlyChanged(before, await snapshot(), [ids.A]);
});

test('rendering with unchanged inputs is a no-op (idempotent)', async () => {
  const before = await snapshot();
  for (const id of Object.values(ids)) {
    const r = await startShotRender(id);
    assert.equal(r.skipped, true);
  }
  assertOnlyChanged(before, await snapshot(), []);
});

test('editing a shot marks only that shot stale', async () => {
  await db.shot.update({ where: { id: ids.C }, data: { camera: 'Dolly in' } });
  const states = await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, renderState((await db.shot.findUnique({ where: { id }, ...shotWithRefs }))!)] as const));
  for (const [k, s] of states) assert.equal(s.stale, k === 'C', `shot ${k} stale should be ${k === 'C'}`);
});

test('editing dialogue or duration does not invalidate the frame, but does invalidate the clip', async () => {
  await db.shot.update({ where: { id: ids.A }, data: { durationSec: 5 } });
  const s = renderState((await db.shot.findUnique({ where: { id: ids.A }, ...shotWithRefs }))!);
  assert.equal(s.blocked, null, 'frame is still up to date');
  assert.equal(s.stale, true, 'clip timing changed');
});

test('a render is refused while the frame is out of date', async () => {
  await db.shot.update({ where: { id: ids.B }, data: { framing: 'Close-up' } });
  await assert.rejects(startShotRender(ids.B), /frame is out of date/);
});
