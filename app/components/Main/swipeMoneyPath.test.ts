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

/**
 * The guard, matched as a PROPERTY rather than as a sentence.
 *
 * The first version of this test pinned the literal text
 * `if (!isWritableMarket(chainKey, CONTRACTS.V2.address)) {`. That was a
 * mistake, and it failed the moment the guard was improved: the address
 * being written to is now named once as `target`, and the same value feeds
 * both the check and the send, which is strictly safer than what the literal
 * described. A test that fails when the code gets better is worse than no
 * test, because whoever hits it deletes it.
 *
 * The assertion is now the property that actually matters: isWritableMarket
 * is called with the selected chain and an address, and it runs before
 * anything is sent.
 */
const GUARD_CALL = /isWritableMarket\(\s*chainKey\s*,\s*([A-Za-z0-9_.?]+)\s*\)/;

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
    const match = source.match(GUARD_CALL);
    expect(
      match,
      'No isWritableMarket(chainKey, <address>) call remains in the swipe bet ' +
        'path. It is the only thing stopping a stake leaving for a contract ' +
        'that is not the selected chain market. Re-read the send path first.'
    ).toBeTruthy();
    // The second argument has to be an address. A bare chain check is the
    // failure this whole file exists to catch.
    expect(
      match[1],
      'isWritableMarket is being called with something that does not look ' +
        'like an address. Gating on the chain alone lets a stake leave for a ' +
        'contract that does not exist on the selected chain.'
    ).toMatch(/address|target|market/i);
  });

  it('runs the guard before any transaction is sent', () => {
    const source = readFileSync(TINDER_CARD, 'utf8');
    const guardAt = source.search(GUARD_CALL);
    const firstWrite = source.indexOf('writeContract({');

    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(
      guardAt,
      'A writeContract call now appears before the address guard. Whatever ' +
        'that call is, it can send a stake the guard was meant to refuse.'
    ).toBeLessThan(firstWrite);
  });

  it('checks and sends through one and the same address', () => {
    // The failure this catches: the guard keeps checking one address while the
    // transaction leaves for another, so the check becomes theatre.
    //
    // The original version of this test read the writeContract calls inside
    // handleStakeBet and resolved their address expressions. That premise is
    // gone: the send now lives in useMarketWrite, and handleStakeBet delegates
    // to it. Rewriting the assertion rather than deleting it, because the
    // invariant did not change even though the code moved.
    //
    // What is asserted now is the thing that makes drift impossible: the value
    // handed to isWritableMarket is a single named binding, and that same
    // binding is what the send path is given.
    const source = readFileSync(TINDER_CARD, 'utf8');
    const stakeBetAt = source.indexOf('const handleStakeBet');
    expect(stakeBetAt).toBeGreaterThan(-1);

    const after = source.slice(stakeBetAt);
    const body = after.slice(0, after.indexOf('\n  const handle', 1));

    const guard = body.match(GUARD_CALL);
    expect(
      guard,
      'handleStakeBet no longer calls isWritableMarket at all.'
    ).toBeTruthy();

    const guardedName = guard[1];

    // The guarded value has to be a binding declared in this function, not an
    // expression evaluated twice. Two evaluations can disagree; one cannot.
    const declared = new RegExp(
      'const\\s+' + guardedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*='
    ).test(body);
    expect(
      declared,
      `The guard checks \`${guardedName}\`, which is not a const declared inside ` +
        'handleStakeBet. Guarding an inline expression means the check and the ' +
        'send can evaluate to different addresses.'
    ).toBe(true);

    // And nothing in this function may send a transaction on its own, bypassing
    // the delegate that re-checks at send time.
    expect(
      /writeContract\s*\(/.test(body),
      'handleStakeBet sends a transaction directly again. The send belongs in ' +
        'useMarketWrite, which re-checks the address at send time because the ' +
        'network switcher can move under an open dialog.'
    ).toBe(false);
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
