import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next mis-infer the workspace root.
  outputFileTracingRoot: path.join(__dirname),
  // Fail the build on type/lint errors — the gates are the point of this rewrite.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
