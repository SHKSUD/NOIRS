import { readStored } from '@/lib/storage';

// Serves stored references and frames. Names are validated in readStored (no path traversal).
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const f = await readStored(name);
  if (!f) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      'content-type': f.mime,
      // Files are content-addressed, so they never change under the same name.
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // SVG frames are images only: no scripts, no external loads.
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
