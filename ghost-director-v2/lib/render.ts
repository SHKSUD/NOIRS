import { db } from './db';
import { getVideo, videoFor } from './providers';
import { fileUrl, readStored, removeFile, saveFile, sha, EXT } from './storage';
import { frameState, shotWithRefs, type ShotWithRefs } from './storyboard';
import type { RenderQuality } from './providers/video-types';

// Per-shot video render. Rules this file guarantees:
// - A clip is rendered from the shot's up-to-date storyboard frame plus its camera, mood, duration and dialogue.
// - Same inputs => nothing to do (idempotent). A shot already rendering the same inputs is not started twice.
// - Every read and write is scoped to ONE shot id. Rendering a shot never touches any other shot.
// - A job whose result arrives after the shot was re-rendered with newer inputs is discarded.

const RENDER_VERSION = 1;
export const qualityOf = (shot: ShotWithRefs): RenderQuality => (shot.scene.project.renderQuality === 'final' ? 'final' : 'draft');
const JOB_TIMEOUT_MS = 10 * 60_000; // a render older than this counts as abandoned

export function renderHash(shot: ShotWithRefs): string {
  return sha(JSON.stringify({
    v: RENDER_VERSION,
    provider: getVideo().name,
    quality: qualityOf(shot),
    frame: shot.storyboardImage, // content-addressed, so a new frame image = new hash
    description: shot.description,
    camera: shot.camera,
    mood: shot.mood,
    durationSec: shot.durationSec,
    dialogue: shot.dialogue,
  }), 32);
}

export type RenderStatus = 'idle' | 'rendering' | 'done' | 'failed';
export type RenderState = {
  status: RenderStatus;
  url: string | null;
  isVideo: boolean; // mp4 (real model) vs animated SVG (mock)
  stale: boolean; // has a clip, but the shot's inputs changed since
  blocked: null | 'no-frame' | 'frame-stale';
  error: string | null;
};

export function renderState(shot: ShotWithRefs): RenderState {
  const f = frameState(shot);
  return {
    status: (shot.renderStatus as RenderStatus) || 'idle',
    url: fileUrl(shot.renderOutput),
    isVideo: !!shot.renderOutput?.endsWith('.mp4'),
    stale: !!shot.renderOutput && shot.renderInputHash !== renderHash(shot),
    blocked: !f.url ? 'no-frame' : f.stale ? 'frame-stale' : null,
    error: shot.renderError,
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const load = (id: string) => db.shot.findUnique({ where: { id }, ...shotWithRefs });

export async function startShotRender(shotId: string, force = false): Promise<RenderState & { skipped: boolean }> {
  const shot = await load(shotId);
  if (!shot) throw new Error('Shot not found.');
  const state = renderState(shot);
  if (state.blocked === 'no-frame') throw new Error('Generate this shot\'s storyboard frame first.');
  if (state.blocked === 'frame-stale') throw new Error('This shot\'s frame is out of date. Update the frame first.');

  const hash = renderHash(shot);
  const fresh = shot.renderStartedAt && shot.renderStartedAt.getTime() > Date.now() - JOB_TIMEOUT_MS;
  // Up to date, or already rendering exactly these inputs: nothing to do.
  if (!force && shot.renderStatus === 'done' && shot.renderOutput && shot.renderInputHash === hash) return { ...state, skipped: true };
  if (shot.renderStatus === 'rendering' && shot.renderPendingHash === hash && fresh) return { ...state, skipped: true };

  const startedAt = new Date();
  await db.shot.update({
    where: { id: shotId },
    data: { renderStatus: 'rendering', renderPendingHash: hash, renderStartedAt: startedAt, renderJob: null, renderError: null },
  });

  try {
    const frame = await readStored(shot.storyboardImage!);
    if (!frame) throw new Error('The storyboard frame file is missing. Regenerate the frame.');
    const { jobId } = await getVideo().start({
      shotNumber: `${shot.scene.order + 1}.${shot.order + 1}`,
      description: shot.description,
      camera: shot.camera,
      mood: shot.mood,
      durationSec: shot.durationSec,
      dialogue: shot.dialogue,
      frame,
      quality: qualityOf(shot),
    });
    // Only attach the job if this start is still the latest one for the shot.
    await db.shot.updateMany({ where: { id: shotId, renderStartedAt: startedAt }, data: { renderJob: jobId } });
  } catch (e) {
    await db.shot.updateMany({
      where: { id: shotId, renderStartedAt: startedAt },
      data: { renderStatus: shot.renderOutput ? 'done' : 'failed', renderError: message(e).slice(0, 500), renderPendingHash: null },
    });
  }
  const after = await load(shotId);
  return { ...renderState(after!), skipped: false };
}

export async function pollShotRender(shotId: string): Promise<RenderState> {
  const shot = await load(shotId);
  if (!shot) throw new Error('Shot not found.');
  const job = shot.renderJob;
  if (shot.renderStatus !== 'rendering' || !job) {
    // A job that never got an id and is past the timeout is abandoned.
    if (shot.renderStatus === 'rendering' && shot.renderStartedAt && shot.renderStartedAt.getTime() < Date.now() - JOB_TIMEOUT_MS) {
      const r = await db.shot.update({ where: { id: shotId }, data: { renderStatus: shot.renderOutput ? 'done' : 'failed', renderError: 'The render timed out.' }, ...shotWithRefs });
      return renderState(r);
    }
    return renderState(shot);
  }

  const res = await videoFor(job).poll(job);
  if (!res.done) return renderState(shot);

  if ('error' in res) {
    await db.shot.updateMany({
      where: { id: shotId, renderJob: job },
      data: { renderStatus: shot.renderOutput ? 'done' : 'failed', renderError: res.error.slice(0, 500), renderJob: null, renderPendingHash: null },
    });
  } else {
    const ext = EXT[res.mime];
    const name = ext ? await saveFile(`clip-${shotId}-${sha(res.data)}.${ext}`, res.data) : null;
    // Commit only if this job is still the shot's current job (not superseded by a newer render).
    const committed = name ? await db.shot.updateMany({
      where: { id: shotId, renderJob: job },
      data: { renderStatus: 'done', renderOutput: name, renderInputHash: shot.renderPendingHash, renderJob: null, renderPendingHash: null, renderError: null },
    }) : { count: 0 };
    if (!name) {
      await db.shot.updateMany({ where: { id: shotId, renderJob: job }, data: { renderStatus: shot.renderOutput ? 'done' : 'failed', renderError: `Unsupported video type: ${res.mime}`, renderJob: null } });
    } else if (committed.count === 0) {
      if (name !== shot.renderOutput) await removeFile(name); // superseded result: discard
    } else if (shot.renderOutput && shot.renderOutput !== name) {
      await removeFile(shot.renderOutput);
    }
  }
  return renderState((await load(shotId))!);
}
