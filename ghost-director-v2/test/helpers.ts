// Shared test setup: a throwaway SQLite database and storage folder, mock providers only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function useThrowawayEnv() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'gd-test-'));
  process.env.GD_DATABASE_URL = `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}`;
  process.env.GD_STORAGE_DIR = path.join(tmp, 'storage');
  process.env.GD_MOCK_RENDER_MS = '30';
  delete process.env.IMAGE_PROVIDER;
  delete process.env.VIDEO_PROVIDER;
  return { tmp, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// Creates every table in the throwaway database from prisma/schema.prisma.
export async function createSchema(db: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  const sql = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { encoding: 'utf8', shell: process.platform === 'win32' });
  for (const stmt of sql.split(/;\s*$/m).map(s => s.replace(/^--.*$/gm, '').trim()).filter(Boolean)) await db.$executeRawUnsafe(stmt);
}
