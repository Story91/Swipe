import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ALLOWED = path.join('lib', 'chains');
const SCAN_DIRS = ['app', 'lib'];
const EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(full))) out.push(full);
  }
  return out;
}

// Matches both static imports and the dynamic `await import('viem/chains')` form,
// which is how one route slipped past an earlier grep.
const DIRECT_CHAIN_IMPORT = /(from|import\()\s*['"](viem|wagmi)\/chains['"]/;

describe('chain abstraction is not bypassed', () => {
  it('no module outside lib/chains imports a chain directly', () => {
    const files = SCAN_DIRS
      .map(d => path.join(ROOT, d))
      .filter(existsSync)
      .flatMap(d => walk(d));

    const wagmiConfig = path.join(ROOT, 'wagmi.ts');
    if (existsSync(wagmiConfig)) files.push(wagmiConfig);

    const offenders = files
      .filter(file => {
        const rel = path.relative(ROOT, file);
        if (rel.startsWith(ALLOWED)) return false;
        return DIRECT_CHAIN_IMPORT.test(readFileSync(file, 'utf8'));
      })
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('no module hardcodes the public Base RPC as a fallback', () => {
    const files = SCAN_DIRS
      .map(d => path.join(ROOT, d))
      .filter(existsSync)
      .flatMap(d => walk(d));

    const offenders = files
      .filter(file => {
        const rel = path.relative(ROOT, file);
        if (rel.startsWith(ALLOWED)) return false;
        return readFileSync(file, 'utf8').includes('mainnet.base.org');
      })
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });
});
