import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { db } from './db';
import { renderState } from './render';
import { fileUrl, readStored, removeFile, saveFile, sha } from './storage';
import { shotWithRefs } from './storyboard';

// Milestone 4: assemble up-to-date clips in scene order into one MP4.
// Shots without an up-to-date clip are skipped and reported, never silently included.
// Same set of clips => same cut (idempotent); nothing about the shots is changed.

const ASSEMBLE_VERSION = 1;
const W = 1280, H = 720, FPS = 24;
const run = promisify(execFile);

export type CutItem = {
  shotId: string; number: string; scene: string; description: string; dialogue: string; camera: string; durationSec: number;
  kind: 'clip' | 'mock' | 'skip'; // clip = real video; mock = mock clip (title card in the cut); skip = left out
  reason: string | null; // why a shot was skipped
  clip: string | null;
};

export type CutPlan = { items: CutItem[]; included: number; skipped: number; seconds: number; hash: string };

export async function planCut(projectId: string): Promise<CutPlan> {
  const scenes = await db.scene.findMany({
    where: { projectId }, orderBy: { order: 'asc' },
    select: { shots: { orderBy: { order: 'asc' }, ...shotWithRefs } },
  });
  const items: CutItem[] = scenes.flatMap((sc, si) => sc.shots.map((s, i) => {
    const r = renderState(s);
    const reason = r.status === 'rendering' ? 'still rendering' : !r.url ? 'not rendered' : r.stale ? 'clip out of date' : null;
    return {
      shotId: s.id, number: `${si + 1}.${i + 1}`, scene: s.scene.heading, description: s.description, dialogue: s.dialogue,
      camera: s.camera, durationSec: s.durationSec, reason, clip: reason ? null : s.renderOutput,
      kind: reason ? 'skip' : r.isVideo ? 'clip' : 'mock',
    } satisfies CutItem;
  }));
  const used = items.filter(i => i.kind !== 'skip');
  return {
    items,
    included: used.length,
    skipped: items.length - used.length,
    seconds: Math.round(used.reduce((t, i) => t + i.durationSec, 0) * 10) / 10,
    hash: sha(JSON.stringify({ v: ASSEMBLE_VERSION, used: used.map(i => [i.shotId, i.clip, i.durationSec, i.number, i.description, i.dialogue]) }), 32),
  };
}

export type ExportState = { url: string | null; fresh: boolean; exportedAt: string | null };

export async function exportState(projectId: string, plan?: CutPlan): Promise<ExportState> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { exportFile: true, exportHash: true, exportedAt: true } });
  const current = plan ?? await planCut(projectId);
  return { url: fileUrl(p?.exportFile), fresh: !!p?.exportFile && p.exportHash === current.hash, exportedAt: p?.exportedAt?.toISOString() ?? null };
}

// ---- ffmpeg helpers ----

const FONTS = ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'];

function wrap(text: string, width: number, maxLines: number): string {
  const lines: string[] = [''];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > width) {
      if (lines.length === maxLines) { lines[lines.length - 1] += '…'; break; }
      lines.push('');
    }
    lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  return lines.join('\n');
}

const ENCODE = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2'];

async function ffmpeg(args: string[], cwd: string) {
  if (!ffmpegPath) throw new Error('ffmpeg is not available on this platform.');
  try {
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`ffmpeg failed: ${(err.stderr || err.message).trim().split('\n').slice(-3).join(' ')}`);
  }
}

async function hasAudio(file: string, cwd: string): Promise<boolean> {
  try { await run(ffmpegPath!, ['-hide_banner', '-i', file], { cwd }); return false; } catch (e) {
    return /Stream #\d+:\d+.*Audio:/.test((e as { stderr?: string }).stderr || '');
  }
}

// A real clip, normalised to 1280x720 @ 24 fps with stereo audio, trimmed or held to the shot's duration.
async function clipSegment(item: CutItem, out: string, cwd: string) {
  const stored = await readStored(item.clip!);
  if (!stored) throw new Error(`Clip file for shot ${item.number} is missing. Re-render it.`);
  const src = `src-${item.shotId}.mp4`;
  await writeFile(path.join(cwd, src), stored.data);
  const d = String(item.durationSec);
  const v = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=${d}[v]`;
  if (await hasAudio(src, cwd)) {
    await ffmpeg(['-i', src, '-filter_complex', `${v};[0:a]aresample=48000,apad[a]`, '-map', '[v]', '-map', '[a]', '-t', d, ...ENCODE, out], cwd);
  } else {
    await ffmpeg(['-i', src, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', v, '-map', '[v]', '-map', '1:a', '-t', d, ...ENCODE, out], cwd);
  }
}

// Mock clips are animated SVG previews, which ffmpeg cannot decode: they become a title card for the shot's duration.
async function cardSegment(item: CutItem, out: string, cwd: string, font: string | null, i: number) {
  const files = { head: `head-${i}.txt`, body: `body-${i}.txt`, dlg: `dlg-${i}.txt` };
  await writeFile(path.join(cwd, files.head), `SHOT ${item.number}  ·  ${item.scene}  ·  MOCK CLIP`);
  await writeFile(path.join(cwd, files.body), wrap(item.description, 46, 4));
  await writeFile(path.join(cwd, files.dlg), wrap(item.dialogue, 60, 2));
  const f = font ? `fontfile=font.ttf:` : '';
  const filters = [
    `drawtext=${f}textfile=${files.head}:fontcolor=0xe9b75a:fontsize=26:x=60:y=60`,
    `drawtext=${f}textfile=${files.body}:fontcolor=white:fontsize=44:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2-30`,
    item.dialogue ? `drawtext=${f}textfile=${files.dlg}:fontcolor=white:fontsize=30:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-150` : null,
  ].filter(Boolean).join(',');
  await ffmpeg([
    '-f', 'lavfi', '-i', `color=c=0x0b1330:s=${W}x${H}:r=${FPS}:d=${item.durationSec}`,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-vf', filters, '-t', String(item.durationSec), ...ENCODE, out,
  ], cwd);
}

export async function assembleCut(projectId: string): Promise<{ state: ExportState; plan: CutPlan; reused: boolean }> {
  const plan = await planCut(projectId);
  if (!plan.included) throw new Error('No shots have an up-to-date clip yet. Render some shots first.');

  const project = await db.project.findUnique({ where: { id: projectId }, select: { exportFile: true, exportHash: true } });
  if (!project) throw new Error('Project not found.');
  // Idempotent: same clips => keep the existing cut.
  if (project.exportFile && project.exportHash === plan.hash && await readStored(project.exportFile)) {
    return { state: await exportState(projectId, plan), plan, reused: true };
  }

  const cwd = await mkdtemp(path.join(tmpdir(), 'gd-cut-'));
  try {
    const font = FONTS.find(f => existsSync(f)) ?? null;
    if (font) await copyFile(font, path.join(cwd, 'font.ttf')); // relative paths avoid filter escaping of "C:"
    const used = plan.items.filter(i => i.kind !== 'skip');
    const segs: string[] = [];
    for (const [i, item] of used.entries()) {
      const seg = `seg-${String(i).padStart(3, '0')}.mp4`;
      if (item.kind === 'clip') await clipSegment(item, seg, cwd); else await cardSegment(item, seg, cwd, font, i);
      segs.push(seg);
    }
    await writeFile(path.join(cwd, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', 'cut.mp4'], cwd);

    const data = await readFile(path.join(cwd, 'cut.mp4'));
    const name = await saveFile(`cut-${projectId}-${sha(data)}.mp4`, data);
    await db.project.update({ where: { id: projectId }, data: { exportFile: name, exportHash: plan.hash, exportedAt: new Date() } });
    if (project.exportFile && project.exportFile !== name) await removeFile(project.exportFile);
    return { state: await exportState(projectId, plan), plan, reused: false };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
