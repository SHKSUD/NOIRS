import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Local file storage for dev (storage/, gitignored). Production storage is an open question.
// GD_STORAGE_DIR lets tests use a throwaway folder.
const DIR = process.env.GD_STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'storage');
const SAFE = /^[a-z]+-[a-z0-9-]+\.(png|jpg|webp|svg|mp4)$/;

export const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4' };
export const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4' };

export const sha = (data: Buffer | string, len = 16) => createHash('sha256').update(data).digest('hex').slice(0, len);
export const isSafeName = (name: string) => SAFE.test(name);
export const fileUrl = (name: string | null | undefined) => (name ? `/files/${name}` : null);

export async function saveFile(name: string, data: Buffer) {
  if (!isSafeName(name)) throw new Error('Bad file name');
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), data);
  return name;
}

export async function readStored(name: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!isSafeName(name)) return null;
  try {
    const data = await readFile(path.join(DIR, name));
    return { data, mime: MIME[name.split('.').pop()!] };
  } catch {
    return null;
  }
}

export async function removeFile(name: string | null | undefined) {
  if (name && isSafeName(name)) await unlink(path.join(DIR, name)).catch(() => {});
}
