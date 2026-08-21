import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

const CARD = path.join('app', 'components', 'Market', 'SwipeTokenCard.tsx');
const HOOK = path.join('lib', 'chains', 'useSwipeTokenBuy.ts');
const CONFIG = path.join('lib', 'chains', 'swipeToken.ts');

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** The writeContractAsync call in the hook, and nothing else in the file. */
function sendBlock(src: string): string {
  const start = src.indexOf('return writeContractAsync({');
  expect(start, 'the hook must send through writeContractAsync').toBeGreaterThan(-1);
  const end = src.indexOf('});', start);
  expect(end, 'the writeContractAsync call must close').toBeGreaterThan(start);
  return src.slice(start, end);
}

/**
 * The $WIPE buy is the only path in this app that attaches native value to a
 * contract it does not own, and native value is the one kind of send that
 * cannot fail safely. A token transfer to a wrong address reverts. Ether sent
 * to a contract willing to keep it simply lands, and nobody holds the key.
 *
 * lib/chains/no-direct-imports.test.ts sweeps for exactly this shape and skips
 * lib/chains, which is where the send now lives, so that sweep cannot see it.
 * These are the pins that can.
 *
 * Structural rather than behavioural on purpose, and for the same reason as
 * app/components/Main/swipeMoneyPath.test.ts: a rendering test can be made to
 * pass by a component that resolves the right address and then sends to a
 * different one. What has to hold is the shape of the path.
 */
describe('the $WIPE buy leaves through one guarded path', () => {
  it('the card does not send anything itself', () => {
    const src = read(CARD);

    // The send belongs to the hook. A component holding writeContractAsync has
    // its own way out, and the guard becomes advisory.
    expect(src, `${CARD} must not call the wallet directly`).not.toMatch(/useWriteContract/);
    expect(src, `${CARD} must not call the wallet directly`).not.toMatch(/writeContractAsync/);
    expect(src, `${CARD} must not attach value to a call of its own`).not.toMatch(
      /value:\s*(ethers\.)?parseEther\s*\(/
    );
    expect(src, `${CARD} must buy through useSwipeTokenBuy`).toContain('useSwipeTokenBuy');
  });

  it('the card names the address it is about to pay', () => {
    const src = read(CARD);

    // Same rule as every market write in this repo. Gating on the chain alone
    // checks nothing about where the money lands.
    expect(src, `${CARD} must gate on the address, not on the chain`).toContain('isSwipeCurve(');
  });

  it('the card sets a real floor rather than accepting any fill', () => {
    const src = read(CARD);

    expect(src, `${CARD} must derive minTokensOut from the quote`).toContain('minTokensOut(');
    // A zero floor is the same as signing a blank cheque on a curve anyone can
    // move first. No \b at the end: BigInt(0) closes on a bracket, and a word
    // boundary after a bracket never matches, which is how an earlier version
    // of this line passed against a card that did exactly this.
    expect(src, `${CARD} must not send a zero floor`).not.toMatch(/floor:\s*(BigInt\(0\)|0n|0[,\s}])/);
  });

  it('the hook compares the address before it attaches value', () => {
    const src = read(HOOK);

    expect(src, `${HOOK} must re-check the address at send time`).toContain('isSwipeCurve(');
    // A curve that sells some other token would take the ETH and owe this
    // buyer nothing, which no address comparison alone would catch if the
    // configured address were simply wrong.
    expect(src, `${HOOK} must check the curve sells this token`).toMatch(/mismatch/);
  });

  it('the hook moves the wallet and pins the chain', () => {
    const src = read(HOOK);

    expect(src, `${HOOK} must switch the wallet's chain before signing`).toContain(
      'switchChainAsync({ chainId: curve.chainId })'
    );
    // Without a pinned chainId wagmi passes chain: null, viem skips
    // assertCurrentChain, and the transaction is signed on whatever chain the
    // wallet happens to be on, against this address.
    //
    // Read out of the send itself rather than off the whole file. Every read in
    // this hook pins chainId too, so a file-wide search stays green on a
    // multicall while the transaction goes unpinned, which is how an earlier
    // version of this line passed against exactly that.
    expect(sendBlock(src), `${HOOK} must pin chainId on the send`).toMatch(/chainId:\s*curve\.chainId/);
  });

  it('the hook sends the same number twice, as the curve requires', () => {
    const src = read(HOOK);

    // PonsV2BondingCurve.buy reverts with NativeValueMismatch unless quoteIn
    // equals msg.value, so these two have to be the same variable and not two
    // separately derived amounts.
    expect(src, `${HOOK} must pass the spend as quoteIn`).toMatch(/args:\s*\[spend,\s*floor,\s*address\]/);
    expect(src, `${HOOK} must attach the same spend as value`).toMatch(/value:\s*spend,/);
  });

  it('the ABI describes no way to sell', () => {
    const src = read(CONFIG);

    // The curve has a sell. This app does not call it, and an ABI entry is all
    // a stray call site would need.
    expect(src, `${CONFIG} must not carry a sell entry`).not.toMatch(/name:\s*'sell'/);
  });
});
