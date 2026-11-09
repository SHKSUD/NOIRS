// Gemini Omni Flash provider against a fake Interactions API on localhost: checks the request we send and
// how we handle each response, without spending anything.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { useThrowawayEnv, createSchema } from './helpers';

const env = useThrowawayEnv();
process.env.VIDEO_PROVIDER = 'omni';
process.env.GEMINI_API_KEY = 'test-key-not-real';

const { db } = await import('../lib/db');
const { frameHash, shotWithRefs } = await import('../lib/storyboard');
const { startShotRender, pollShotRender, renderState } = await import('../lib/render');
const { saveFile } = await import('../lib/storage');

// ---- fake Omni server ----
type Req = { method: string; url: string; key: string | undefined; body: Record<string, any> | null };
const requests: Req[] = [];
const polls: Record<string, number> = {};
let videoB64 = '';
const readBody = (req: IncomingMessage) => new Promise<string>(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => r(d)); });

const server = createServer(async (req, res) => {
  const raw = await readBody(req);
  const body = raw ? JSON.parse(raw) : null;
  requests.push({ method: req.method!, url: req.url!, key: req.headers['x-goog-api-key'] as string, body });
  const send = (code: number, j: object) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
  if (req.method === 'POST' && req.url === '/v1beta/interactions') {
    const blocked = String(body.input?.[1]?.text).includes('BLOCKME');
    return send(200, { id: blocked ? 'int_blocked' : `int_${requests.length}`, status: 'in_progress' });
  }
  const m = req.url!.match(/^\/v1beta\/interactions\/([\w.-]+)$/);
  if (req.method === 'GET' && m) {
    const id = m[1];
    polls[id] = (polls[id] || 0) + 1;
    if (id === 'int_blocked') return send(200, { id, status: 'failed', errors: [{ code: 'safety', message: 'Blocked by safety filters' }] });
    if (polls[id] < 2) return send(200, { id, status: 'in_progress' });
    return send(200, { id, status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: videoB64 }] }] });
  }
  send(404, { error: { message: 'not found' } });
});

const ids: string[] = [];
let png: Buffer;

async function renderToDone(id: string, force = false) {
  await startShotRender(id, force);
  for (let i = 0; i < 50; i++) {
    const s = await pollShotRender(id);
    if (s.status !== 'rendering') return s;
  }
  throw new Error('render did not finish');
}

before(async () => {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${port}/v1beta`;

  // A real PNG frame and a real MP4 "result", made with ffmpeg.
  const pngPath = path.join(env.tmp, 'frame.png');
  const mp4Path = path.join(env.tmp, 'clip.mp4');
  execFileSync(ffmpegPath!, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180', '-frames:v', '1', pngPath]);
  execFileSync(ffmpegPath!, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=3', '-pix_fmt', 'yuv420p', mp4Path]);
  png = readFileSync(pngPath);
  videoB64 = readFileSync(mp4Path).toString('base64');

  await createSchema(db);
  const p = await db.project.create({ data: { title: 'Omni', script: 'x'.repeat(30) } });
  const scene = await db.scene.create({ data: { projectId: p.id, order: 0, heading: 'INT. METRO - NIGHT' } });
  for (const [i, d] of ['Meera sits by the window.', 'BLOCKME shot'].entries()) {
    const s = await db.shot.create({ data: { sceneId: scene.id, order: i, description: d, camera: 'Dolly in', framing: 'Medium', mood: 'Quiet', durationSec: 2.5, dialogue: i ? '' : 'MEERA: Last one for me.' } });
    const name = await saveFile(`frame-${s.id}-0000000000000000.png`, png);
    const row = await db.shot.update({ where: { id: s.id }, data: { storyboardImage: name, storyboardStatus: 'done' }, ...shotWithRefs });
    await db.shot.update({ where: { id: s.id }, data: { storyboardInputHash: frameHash(row) } });
    ids.push(s.id);
  }
});

after(async () => {
  server.close();
  await db.$disconnect();
  env.cleanup();
});

test('sends the documented Interactions request: image + prompt, 3-15 s, draft 360p, background', async () => {
  const r = await renderToDone(ids[0]);
  const create = requests.find(q => q.method === 'POST')!;
  assert.equal(create.url, '/v1beta/interactions');
  assert.equal(create.key, 'test-key-not-real');
  assert.equal(create.body!.model, 'gemini-omni-1.2-flash');
  assert.deepEqual(create.body!.input[0], { type: 'image', data: png.toString('base64'), mime_type: 'image/png' });
  assert.equal(create.body!.input[1].type, 'text');
  assert.match(create.body!.input[1].text, /Meera sits by the window\..*Dolly in.*MEERA: Last one for me\./s);
  assert.deepEqual(create.body!.response_format, { type: 'video', aspect_ratio: '16:9', duration: '3s', resolution: '360p' });
  assert.equal(create.body!.background, true);
  assert.equal(create.body!.store, true);
  // Polled until completed, then saved the MP4.
  assert.ok(requests.filter(q => q.method === 'GET').length >= 2);
  assert.equal(r.status, 'done');
  assert.equal(r.isVideo, true);
  const row = (await db.shot.findUnique({ where: { id: ids[0] } }))!;
  assert.match(row.renderOutput!, /^clip-.*\.mp4$/);
  assert.equal(readFileSync(path.join(process.env.GD_STORAGE_DIR!, row.renderOutput!)).toString('base64'), videoB64);
});

test('a blocked render fails with the API message and leaves the other shot alone', async () => {
  const before = JSON.stringify(await db.shot.findUnique({ where: { id: ids[0] } }));
  const r = await renderToDone(ids[1]);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'Blocked by safety filters');
  assert.equal(JSON.stringify(await db.shot.findUnique({ where: { id: ids[0] } })), before);
});

test('switching the project to final marks clips out of date and re-renders at 720p', async () => {
  const shot = (await db.shot.findUnique({ where: { id: ids[0] } }))!;
  const scene = (await db.scene.findUnique({ where: { id: shot.sceneId } }))!;
  await db.project.update({ where: { id: scene.projectId }, data: { renderQuality: 'final' } });
  const state = renderState((await db.shot.findUnique({ where: { id: ids[0] }, ...shotWithRefs }))!);
  assert.equal(state.stale, true);
  const n = requests.length;
  await renderToDone(ids[0]);
  const create = requests.slice(n).find(q => q.method === 'POST')!;
  assert.equal(create.body!.response_format.resolution, '720p');
});

test('a mock (SVG) frame is refused with a clear message instead of being sent', async () => {
  const svg = await saveFile(`frame-${ids[1]}-1111111111111111.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  const row = await db.shot.update({ where: { id: ids[1] }, data: { storyboardImage: svg, description: 'Plain shot' }, ...shotWithRefs });
  await db.shot.update({ where: { id: ids[1] }, data: { storyboardInputHash: frameHash(row) } });
  const n = requests.length;
  const r = await startShotRender(ids[1]);
  assert.equal(r.status, 'failed');
  assert.match(r.error!, /needs a real image frame/);
  assert.equal(requests.length, n, 'nothing was sent to the API');
});
