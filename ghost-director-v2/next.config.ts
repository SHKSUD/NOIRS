import type { NextConfig } from 'next';
const config: NextConfig = {
  // ffmpeg-static finds its binary relative to its own folder, so it must not be bundled.
  serverExternalPackages: ['ffmpeg-static'],
  // Character reference uploads go through a server action; allow 2 MB images plus form overhead.
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
};
export default config;
