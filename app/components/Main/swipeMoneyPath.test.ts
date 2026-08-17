import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { isWritableMarket, getWritableMarket } from '../../../lib/chains';
import { CONTRACTS } from '../../../lib/contract';

/**
 * The swipe gesture is being replaced. This file exists so that the
 * replacement cannot quietly take the money guard with it.
 *
 * Source-scanning rather than behavioural, following the precedent in
 * lib/chains/no-direct-imports.test.ts, because the thing being protected is
 * structural: an ordering between two statements, and an absence of certain
 * imports in certain directories. Neither survives a unit test of a function.
 *
 * The invariant: every stake reaches the chain through handleStakeBet, whose
 * first executable statement compares the address it is about to write to
 * against the selected chain's live market. The ADDRESS half is the
 * protection. Gating on the chain alone would let a stake leave for a Base
 * address while Robinhood is selected, where there is no contract behind it
 * and the tokens are simply gone.
 *
 * What the gesture migration is allowed to change: which side gets picked, and
 * when the dialog opens. Nothing else.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TINDER_CARD = path.join(ROOT, 'app', 'components', 'Main', 'TinderCard.tsx');

const GUARD = 'if (!isWritableMarket(chainKey, CONTRACTS.V2.address)) {';

/** Directories the gesture engine lives in. None of them may touch money. */
const GESTURE_PATHS = [
  path.join(ROOT, 'lib', 'gesture'),
  path.join(ROOT, 'lib', 'hooks', 'useSwipeGesture.ts'),
  path.join(ROOT, 'app', 'components', 'Main', 'SwipeCard.tsx'),
];

const MONEY_TOKENS =
  /\bwriteContract\b|\bplaceStake\b|\bplaceBet\b|\bhandleStakeBet\b|\bCONTRACTS\b|\buseWriteContract\b/;

function walk(target: string, out: string[] = []): string[] {
  if (!existsSync(target)) return out;
  if (statSync(target).isFile()) {
    out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    const full = path.join(target, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe('swipe money path', () => {
  it('guards the stake on the target address, not just the chain', () => {
    const source = readFileSync(TINDER_CARD, 'utf8');
    expect(
      source.includes(GUARD),
      'The address-comparison guard in handleStakeBet is gone or was reworded. ' +
        'It is the only thing stopping a stake leaving for a contract that is ' +
        'not the selected chain\'s market. Re-read it before changing this test.'
    ).toBe(true);
  });

  it('runs the guard before any transaction is sent', () => {
    const source = readFileSync(TINDER_CARD, 'utf8');
    const guardAt = source.indexOf(GUARD);
    const firstWrite = source.indexOf('writeContract({');

    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(
      guardAt,
      'A writeContract call now appears before the address guard. Whatever ' +
        'that call is, it can send a stake the guard was meant to refuse.'
    ).toBeLessThan(firstWrite);
  });

  it('writes to the same address it checked', () => {
    // Catches the edit that changes one and not the other: the guard keeps
    // checking V2 while the write moves somewhere else, and the check becomes
    // theatre.
    //
    // The write does not name CONTRACTS.V2 directly, it goes through a local
    // alias (`const contract = CONTRACTS.V2`). So the alias is resolved rather
    // than the text compared, otherwise this test would fail on today's
    // perfectly correct code and get deleted by whoever hit it next.
    const source = readFileSync(TINDER_CARD, 'utf8');
    const stakeBetAt = source.indexOf('const handleStakeBet');
    expect(stakeBetAt).toBeGreaterThan(-1);

    // The body of handleStakeBet, up to the next top-level const declaration.
    const after = source.slice(stakeBetAt);
    const body = after.slice(0, after.indexOf('\n  const handle', 1));

    // Local aliases bound to the guarded contract, e.g. `const contract = CONTRACTS.V2;`
    const aliases = new Set(
      [...body.matchAll(/const\s+(\w+)\s*=\s*CONTRACTS\.V2\s*;/g)].map(m => m[1])
    );

    const accepted = (expr: string) =>
      expr.includes('CONTRACTS.V2.address') ||
      [...aliases].some(a => expr.includes(`${a}.address`));

    const addresses = [...body.matchAll(/address:\s*([^,\n]+)/g)].map(m =>
      m[1].trim().replace(/\s+as\s+`0x\$\{string\}`/, '')
    );

    expect(addresses.length).toBeGreaterThan(0);
    for (const addr of addresses) {
      expect(
        accepted(addr),
        `handleStakeBet writes to \`${addr}\`, which does not resolve to the ` +
          'CONTRACTS.V2.address the guard checks. Either the write moved to a ' +
          'different contract or the alias changed; the guard is no longer ' +
          'protecting the address being written to.'
      ).toBe(true);
    }
  });

  it('keeps the gesture engine ignorant of money', () => {
    // The engine reports that a direction was committed. Amounts, minimums,
    // self-bet checks and the address guard stay on the other side of that
    // callback. If any of these files needs a contract, the split has been
    // broken and the guard is no longer the only door.
    const offenders = GESTURE_PATHS.flatMap(p => walk(p))
      .filter(file => {
        // A test file may name these tokens; it sends nothing.
        if (/\.test\.tsx?$/.test(file)) return false;
        return MONEY_TOKENS.test(readFileSync(file, 'utf8'));
      })
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('pins that the swipe path is currently refused, and why', () => {
    // Not an aspiration: this is the live state. The swipe writes to V2 while
    // Base's writable market is V3, so every swipe-driven stake is refused
    // before any wallet UI opens.
    //
    // This assertion WILL fail on the day V3 routing lands, and that is the
    // point: it is a tripwire that makes a human re-read the guard at exactly
    // the moment real money starts flowing through it.
    expect(isWritableMarket('base', CONTRACTS.V2.address)).toBe(false);

    const live = getWritableMarket('base');
    expect(live).not.toBeNull();
    expect(isWritableMarket('base', live!)).toBe(true);
  });
});
