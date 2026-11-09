import { db } from '@/lib/db';
import { readStored } from '@/lib/storage';

// Downloads the project's assembled cut as "<title>.mp4".
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, select: { title: true, exportFile: true } });
  if (!p?.exportFile) return new Response('No cut has been assembled yet.', { status: 404 });
  const f = await readStored(p.exportFile);
  if (!f) return new Response('The cut file is missing. Assemble it again.', { status: 404 });
  const base = p.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'ghost-director-cut';
  return new Response(new Uint8Array(f.data), {
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(f.data.length),
      'content-disposition': `attachment; filename="${base}.mp4"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  });
}
