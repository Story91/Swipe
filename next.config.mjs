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
  /**
   * /usdc-markets/prediction/:id was never a route.
   *
   * The directory holds a layout.tsx and no page.tsx, and Next does not route a
   * segment without a page, so the path 404s. It is absent from
   * .next/routes-manifest.json, which is how this was confirmed rather than
   * reasoned about. Every share sent from the markets grid pointed at it, so
   * every one of those links was dead, including the ones already posted.
   *
   * There is one market page and it is /prediction/:id. This makes the links
   * that are already out there resolve to it. Permanent, because the old path
   * is not coming back.
   */
  async redirects() {
    return [
      {
        source: '/usdc-markets/prediction/:id',
        destination: '/prediction/:id',
        permanent: true,
      },
      // The standalone /usdc-markets page was retired when the USDC markets
      // dashboard merged into the markets grid. Anyone holding the old URL
      // lands on the app, where the grid is the markets surface.
      {
        source: '/usdc-markets',
        destination: '/',
        permanent: true,
      },
    ];
  },
  // Silence warnings
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
