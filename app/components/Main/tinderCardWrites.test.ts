import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { CHAINS, isWritableMarket, type ChainKey } from '../../../lib/chains';
import { CONTRACTS } from '../../../lib/contract';

/**
 * Every transaction TinderCard.tsx can put on the wire, and whether something
 * stops it first.
 *
 * swipeMoneyPath.test.ts already pins the bet. It does not look at the other
 * eight sends in the file, which all reach for CONTRACTS.V1 or CONTRACTS.V2:
 * two claims and six owner-only admin calls. Those had no guard and no pinned
 * chainId, so with Robinhood selected they left for a Base address on a chain
 * where that address holds no code. A call to an address with no code does not
 * revert. It returns success, the wallet says the transaction went through, and
 * nothing happened.
 *
 * Source-scanning rather than behavioural, following swipeMoneyPath.test.ts and
 * lib/chains/no-direct-imports.test.ts: what is protected is an ordering between
 * two statements in a 4000 line component, which no unit test of a function can
 * see.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TINDER_CARD = path.join(ROOT, 'app', 'components', 'Main', 'TinderCard.tsx');

/**
 * Comments removed, so the prose explaining why a form is banned cannot satisfy
 * or trip a check looking for that form. Crude on purpose: it is only ever fed
 * this one file.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const CODE = stripComments(readFileSync(TINDER_CARD, 'utf8'));

/** A send, as opposed to the `useWriteContract()` that produces the sender. */
const SEND = /\bwriteContract\s*\(\s*\{/;

/**
 * Either refusal counts, and which one is right depends on the call.
 *
 * `refuseArchivedWrite` compares the target against the selected chain's live
 * market, so it always refuses an archived address. That is correct for the
 * admin calls, which need an owner key nobody holds. It is wrong for a claim: a
 * market that resolved before the key went can still be claimed, and refusing
 * there would strand money that is owed. Claims are gated on the chain instead
 * and pinned to it.
 */
const GUARD = /refuseArchivedWrite\(|chainKey !== ARCHIVED_CHAIN_KEY/;

/** Members of the component, split on the two-space `const` that opens each. */
function members(src: string): { name: string; body: string }[] {
  const starts = [...src.matchAll(/^ {2}const (\w+)/gm)];
  return starts.map((match, i) => {
    const from = match.index as number;
    const to = i + 1 < starts.length ? (starts[i + 1].index as number) : src.length;
    return { name: match[1], body: src.slice(from, to) };
  });
}

describe('TinderCard write guards', () => {
  it('finds the sends it is meant to be watching', () => {
    // A scanner that matches nothing passes every other test in this file.
    const senders = members(CODE).filter(m => SEND.test(m.body));
    expect(senders.length, 'no writeContract({ call sites found at all').toBeGreaterThan(5);
  });

  it('refuses or pins every writeContract call site', () => {
    const unguarded = members(CODE)
      .filter(m => SEND.test(m.body))
      .filter(m => {
        const send = m.body.search(SEND);
        const guard = m.body.search(GUARD);
        return guard === -1 || guard > send;
      })
      .map(m => m.name);

    expect(
      unguarded,
      `these send a transaction with nothing in front of it: ${unguarded.join(', ')}. ` +
        'Every write in this file targets an archived Base contract, so it either ' +
        'refuses on the address or pins the chain it belongs to.'
    ).toEqual([]);
  });

  it('pins the chain on the claims, which are the sends that still run', () => {
    const claims = members(CODE).find(m => m.name === 'handleClaimReward');
    expect(claims, 'handleClaimReward is gone').toBeTruthy();

    const sends = claims!.body.match(new RegExp(SEND.source, 'g')) ?? [];
    const pins = claims!.body.match(/chainId: ARCHIVED_CHAIN_ID/g) ?? [];
    expect(
      pins.length,
      'a claim is sent without a pinned chainId. wagmi turns an omitted chainId ' +
        'into chain: null, which makes viem skip assertCurrentChain, so the ' +
        'claim gets signed on whatever chain the wallet happens to be on.'
    ).toBe(sends.length);
  });

  it('never lets the address guard pass for an archived contract', () => {
    // The behavioural half. refuseArchivedWrite is only a refusal because
    // isWritableMarket answers false for these addresses on every chain the app
    // offers. If one ever answered true, six owner-only calls would go live
    // against a contract nobody controls.
    for (const key of Object.keys(CHAINS) as ChainKey[]) {
      expect(isWritableMarket(key, CONTRACTS.V1.address)).toBe(false);
      expect(isWritableMarket(key, CONTRACTS.V2.address)).toBe(false);
    }
  });

  it('names the archived chain instead of assuming the default', () => {
    // The claims are pinned to whatever ARCHIVED_CHAIN_KEY resolves to, so that
    // key has to be a real chain with a real id. 'base' as a bare string in the
    // component would type-check and then pin nothing.
    expect(CODE).toMatch(/const ARCHIVED_CHAIN_KEY: ChainKey = 'base';/);
    expect(CHAINS.base.viemChain.id).toBeGreaterThan(0);
  });

  it('leaves no V1-to-V2 changelog in the empty state', () => {
    // What the deck used to render when it ran out: four numbered sections
    // about ETH and SWIPE minimums and two separate prize pools, none of it
    // still true and none of it actionable.
    expect(CODE).not.toMatch(/KEY USER-FACING CHANGES/);
    expect(CODE).not.toMatch(/Under Construction/);
    expect(CODE, 'the empty state must name the selected chain').toMatch(
      /No open markets on \$\{chain\.label\}/
    );
  });
});
