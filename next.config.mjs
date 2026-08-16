/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production build and a running dev server share .next by default, and the
  // build overwrites .next/server out from under the dev server — which then
  // fails at runtime with ChunkLoadError or "Cannot find module './NNNN.js'".
  // Set NEXT_DIST_DIR to verify a build without disturbing a live dev server:
  //   PowerShell:  $env:NEXT_DIST_DIR=".next-check"; npm run build
  //   bash:        NEXT_DIST_DIR=.next-check npm run build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Disable ESLint during builds to avoid any type errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Silence warnings
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
