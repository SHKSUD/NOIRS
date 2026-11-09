import type { NextConfig } from 'next';
const config: NextConfig = {
  // Character reference uploads go through a server action; allow 2 MB images plus form overhead.
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
};
export default config;
