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

  // Every path that sends a market transaction has to compare the address it is
  // about to write to. Two shapes are banned. Gating on the chain alone checks
  // nothing about where the money lands, which is what would have put a Base
  // address on a Robinhood transaction. Gating on isReadOnlyChain() with no
  // argument answers for the build-time default, which held everything shut only
  // while Base itself was unwritable; Base runs V3 now, so that form would open
  // these paths onto contracts whose owner key is lost.
  const WRITE_PATHS = [
    ['app', 'components', 'Main', 'TinderCard.tsx'],
    ['app', 'components', 'Markets', 'SwipeMarkets.tsx'],
    ['app', 'components', 'Modals', 'CreatePredictionModal.tsx'],
    // Sends native ETH. It was missing from this list and had no guard at all.
    ['app', 'components', 'Portfolio', 'UserDashboard.tsx'],
    // The one surface that registers markets on a new chain, and it was absent
    // from this list while carrying four unguarded writes to the archived pool.
    ['app', 'components', 'Admin', 'AdminDashboard.tsx'],
  ];

  it.each(WRITE_PATHS)('gates on the address it writes to: %s', (...segments) => {
    const rel = path.join(...segments);
    const src = readFileSync(path.join(ROOT, rel), 'utf8');

    // Two acceptable gates. Either compare the address directly, or go through
    // useMarketWrite, which compares it at send time and additionally moves the
    // wallet to the matching chain and pins chainId.
    const gated = src.includes('isWritableMarket(') || src.includes('useMarketWrite(');
    expect(gated, `${rel} must gate its writes on isWritableMarket or useMarketWrite`).toBe(true);

    // Matched in the shape of a guard, not anywhere in the file: these comments
    // name the banned forms in order to explain them, and a bare substring
    // search flags its own documentation.
    expect(src, `${rel} must not gate a write on the chain alone`)
      .not.toMatch(/if\s*\(\s*!\s*getWritableMarket\s*\(/);
    expect(src, `${rel} must not gate a write on the build-time default chain`)
      .not.toMatch(/if\s*\(\s*!?\s*isReadOnlyChain\s*\(\s*\)/);
  });

  /**
   * The list above is maintained by hand, which is how it missed the worst one.
   * UserDashboard.tsx sent native ETH to the archived V2 contract with no guard
   * at all, and the suite stayed green because that file was simply not on the
   * list. So this one discovers its own subjects.
   *
   * Native value is the right thing to key on. V3 is collateralised in an ERC-20
   * and takes no ether at all, so any `value:` on a market write is by
   * construction aimed at an archived contract. And unlike a failed token
   * transfer, ether sent to an address with no code does not revert: it lands,
   * and nobody holds the key.
   */
  it('every native-value send is guarded, whoever wrote it', () => {
    const NATIVE_VALUE = /value:\s*(ethers\.)?parseEther\s*\(/;

    const files = SCAN_DIRS
      .map(d => path.join(ROOT, d))
      .filter(existsSync)
      .flatMap(d => walk(d))
      .filter(f => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

    const unguarded = files
      .filter(file => {
        const rel = path.relative(ROOT, file);
        if (rel.startsWith(ALLOWED)) return false;
        const src = readFileSync(file, 'utf8');
        if (!NATIVE_VALUE.test(src)) return false;
        return !src.includes('isWritableMarket(') && !src.includes('useMarketWrite(');
      })
      .map(f => path.relative(ROOT, f));

    expect(
      unguarded,
      'these send native ether without comparing the address they send it to'
    ).toEqual([]);
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
