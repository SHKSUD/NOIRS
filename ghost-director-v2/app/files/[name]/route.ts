import { readStored } from '@/lib/storage';

// Serves stored references, frames, clips and cuts. Names are validated in readStored (no path traversal).
// Supports HTTP Range requests so video players can seek.
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const f = await readStored(name);
  if (!f) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = {
    'content-type': f.mime,
    'accept-ranges': 'bytes',
    // Files are content-addressed, so they never change under the same name.
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    // SVG frames/clips are images only: no scripts, no external loads.
    'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  };
  const size = f.data.length;
  const m = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
    return new Response(new Uint8Array(f.data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(f.data), { headers: { ...headers, 'content-length': String(size) } });
}
