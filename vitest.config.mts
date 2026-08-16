import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    // Mirrors the "@/*" -> "./*" path alias in tsconfig.json.
    // __dirname does not exist in ESM, hence import.meta.url.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
