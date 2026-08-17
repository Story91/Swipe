/**
 * Dev server on its own build directory and port.
 *
 * Two agents work in this repo at once, and `next dev` and `next build` share
 * .next by default: the build overwrites .next/server under the running dev
 * server, which then dies with "Cannot find module './NNNN.js'". That has cost
 * this project several false debugging sessions - failures that looked like
 * code and were contention.
 *
 * This starts a dev server that touches neither the shared .next nor port 3000,
 * so it can run alongside whatever the other session is doing.
 *
 *   npm run dev:isolated
 */
const { spawn } = require('child_process');

const port = process.env.PORT || '3001';
const distDir = process.env.NEXT_DIST_DIR || '.next-verify';

console.log(`dev server on :${port}, building into ${distDir}`);

spawn('npx', ['next', 'dev', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: distDir },
}).on('exit', (code) => process.exit(code ?? 0));
