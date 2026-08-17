import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  symbolFor,
  isArchivedLeg,
  formatAmount,
  formatSigned,
  totalsByToken,
  tokenRank,
  rowKey,
} from './portfolioTokens';

/**
 * The four portfolio screens, held to the two things they kept getting wrong.
 *
 * One: a figure with the wrong unit next to it. Every amount on these screens
 * had ETH written into the markup, on screens that list positions held in the
 * chain's stablecoin, and the summary rows added ether to dollars and printed
 * the result as a single number. Amounts arrive in each token's own readable
 * units, so 0.5 and 25 can be added by arithmetic and still mean nothing.
 *
 * Two: a failed read reported as an empty book. Each screen ran
 * `setLoading(true)` on its 30 second refresh and swapped the rows for a
 * spinner, and on a rejected promise swapped them for an error page. Not read
 * and none are different facts and the screen has to keep them apart.
 *
 * Half of these are behavioural, over the helpers the screens share. The rest
 * scan source, following lib/chains/no-direct-imports.test.ts and
 * historySurvives.test.ts, because what is being protected is the absence of a
 * shape: the literal unit must not come back, the direct fetch must not come
 * back, and the claim button must not come back.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A file with its comments removed, because a comment quoting the old bug
 *  otherwise trips a scan for the old bug. */
function body(file: string): string {
  return readFileSync(path.join(HERE, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

const SCREENS = ['MyPortfolio.tsx', 'ActiveBets.tsx', 'BetHistory.tsx'] as const;

describe('a symbol comes from the chain, never from the leg name', () => {
  it('names the collateral leg after the chain it is on', () => {
    expect(symbolFor('USDC', 'base')).toBe('USDC');
    // Same stored leg, different token. Printing 'USDC' here tells a Robinhood
    // user they hold dollars of a brand they do not hold.
    expect(symbolFor('USDC', 'robinhood')).toBe('USDG');
  });

  it('leaves the two archived legs alone', () => {
    expect(symbolFor('ETH', 'robinhood')).toBe('ETH');
    expect(symbolFor('SWIPE', 'base')).toBe('SWIPE');
  });

  it('treats a row with no token as collateral, on whichever chain', () => {
    expect(symbolFor(undefined, 'robinhood')).toBe('USDG');
  });
});

describe('archived legs are recognised as archived', () => {
  it('is true for the two legs on the contracts nobody owns', () => {
    expect(isArchivedLeg('ETH')).toBe(true);
    expect(isArchivedLeg('SWIPE')).toBe(true);
  });

  it('is false for the live collateral leg, named or implied', () => {
    expect(isArchivedLeg('USDC')).toBe(false);
    expect(isArchivedLeg(undefined)).toBe(false);
  });
});

describe('nothing is ever summed across tokens', () => {
  const rows = [
    { token: 'ETH' as const, stakeAmount: 0.5, potentialPayout: 0.8, profit: 0.3 },
    { token: 'USDC' as const, stakeAmount: 25, potentialPayout: 40, profit: 15 },
    { token: 'USDC' as const, stakeAmount: 10, potentialPayout: 12, profit: 2 },
  ];

  it('keeps each token on its own line', () => {
    const totals = totalsByToken(rows);
    expect(totals).toHaveLength(2);

    const collateral = totals.find((t) => t.token === 'USDC')!;
    expect(collateral.staked).toBe(35);
    expect(collateral.profit).toBe(17);
    expect(collateral.count).toBe(2);

    const eth = totals.find((t) => t.token === 'ETH')!;
    expect(eth.staked).toBe(0.5);
    expect(eth.count).toBe(1);

    // The number the old screens printed, which is 35.5 of nothing at all.
    const crossToken = totals.reduce((sum, t) => sum + t.staked, 0);
    expect(crossToken).toBe(35.5);
    expect(collateral.staked).not.toBe(crossToken);
  });

  it('puts the live token first and the archived legs after it', () => {
    expect(totalsByToken(rows).map((t) => t.token)).toEqual(['USDC', 'ETH']);
    expect(tokenRank('USDC')).toBeLessThan(tokenRank('ETH'));
    expect(tokenRank('ETH')).toBeLessThan(tokenRank('SWIPE'));
  });

  it('files a row with no token under the collateral leg', () => {
    const totals = totalsByToken([{ stakeAmount: 5, profit: 1 }]);
    expect(totals).toEqual([
      { token: 'USDC', staked: 5, payout: 0, profit: 1, count: 1 },
    ]);
  });
});

describe('precision follows the token', () => {
  it('gives a stablecoin two places and $SWIPE none', () => {
    expect(formatAmount(25, 'USDC')).toBe('25.00');
    expect(formatAmount(1_000_000, 'SWIPE')).toBe('1,000,000');
    expect(formatAmount(0.0125, 'ETH')).toBe('0.01250');
  });

  it('always shows the sign on a result', () => {
    expect(formatSigned(15, 'USDC')).toBe('+15.00');
    expect(formatSigned(-15, 'USDC')).toBe('−15.00');
  });
});

describe('a row key survives a market backed in two tokens', () => {
  it('does not hand React two children with one key', () => {
    // The route returns one row per token, so both rows carry pred_v2_9.
    expect(rowKey('pred_v2_9', 'ETH')).not.toBe(rowKey('pred_v2_9', 'USDC'));
  });
});

describe('no screen writes a unit into the markup', () => {
  it.each(SCREENS)('%s prints no literal token symbol', (screen) => {
    const source = body(screen);
    expect(
      source,
      'a token symbol is hardcoded again; it has to come from symbolFor(token, chainKey)'
    ).not.toMatch(/\bETH\b/);
    expect(source).not.toMatch(/\bUSDC\b/);
    expect(source).not.toMatch(/\bUSDG\b/);
  });

  it.each(SCREENS)('%s asks the chain for the symbol', (screen) => {
    expect(body(screen)).toMatch(/symbolFor\(token, chainKey\)/);
  });
});

describe('every read names the chain it is about', () => {
  it('sends the active chain with the portfolio request', () => {
    expect(body('usePortfolio.ts')).toMatch(/userAddress=\$\{address\}&chain=\$\{chainKey\}/);
  });

  it('re-runs the read, and the interval it starts, when the chain changes', () => {
    const source = body('usePortfolio.ts');
    const deps = source.slice(source.indexOf('const timer = setInterval'));
    expect(
      deps,
      'without chainKey the interval keeps the chain captured on first render, ' +
        'which is the build-time default'
    ).toMatch(/\}, \[[^\]]*chainKey[^\]]*\]\)/);
  });

  it.each(SCREENS)('%s reads through the hook rather than fetching its own', (screen) => {
    const source = body(screen);
    expect(source).toMatch(/usePortfolio\(address\)/);
    expect(
      source,
      'a second copy of the fetch is how one screen ends up on another chain'
    ).not.toMatch(/fetch\(/);
  });
});

describe('a failed read never empties the book', () => {
  it('does not write rows on the failure path', () => {
    const source = body('usePortfolio.ts');
    const start = source.indexOf('} catch (err) {');
    expect(start, 'the catch block has been reshaped; repoint this test').toBeGreaterThan(-1);
    const catchBlock = source.slice(start, source.indexOf('} finally {'));
    expect(
      catchBlock,
      'the failure path is writing rows again, which reports an outage as an empty book'
    ).not.toMatch(/setHeld/);
    expect(catchBlock).toMatch(/setFailure/);
  });

  it('never swaps a non-success answer for an empty list', () => {
    expect(body('usePortfolio.ts')).not.toMatch(/success\s*\?[^;]*:\s*\[\]/);
  });

  it.each(SCREENS)('%s only shows a loading state when it has nothing', (screen) => {
    const source = body(screen);
    // The guard is `rows === null && loading`. A bare `if (loading)` puts the
    // spinner over good rows every 30 seconds.
    expect(source).toMatch(/rows === null && loading/);
    expect(source).not.toMatch(/if \(loading\)/);
  });

  it.each(SCREENS)('%s keeps the rows on screen after a failed refresh', (screen) => {
    const source = body(screen);
    expect(source).toMatch(/StaleNotice/);
    // The full-screen error is allowed only when there is nothing else to show.
    expect(source).not.toMatch(/if \(error\)/);
  });
});

describe('the $SWIPE claim screen does not offer a claim it cannot honour', () => {
  const claim = body('SwipeClaim.tsx');

  it('has no write path at all', () => {
    // Measured on Base: the contract holds 0 SWIPE and the smallest tier is
    // 1,000,000, so claimSwipe() reverts with "Insufficient SWIPE balance" for
    // every wallet the contract itself rates as eligible.
    expect(claim, 'the claim button is back, and it reverts').not.toMatch(/useWriteContract/);
    expect(claim).not.toMatch(/writeContract\(/);
    expect(claim).not.toMatch(/claimSwipe/);
  });

  it('reads the pot live rather than asserting a balance in the copy', () => {
    expect(claim).toMatch(/functionName: 'getSwipeBalance'/);
  });

  it('pins its reads to Base instead of following the wallet', () => {
    // $SWIPE only exists on Base. On any other chain this address holds no
    // code, so an unpinned read fails and the screen reports "unknown" for a
    // number it could have fetched.
    const reads = claim.match(/useReadContract\(/g)?.length ?? 0;
    const pinned = claim.match(/chainId: BASE\.viemChain\.id/g)?.length ?? 0;
    expect(reads).toBeGreaterThan(0);
    expect(pinned).toBe(reads);
  });

  it('does not clear a bet count it failed to read', () => {
    const start = claim.indexOf('const loadBets');
    const fn = claim.slice(start, claim.indexOf('const loadHistory'));
    const catchBlock = fn.slice(fn.indexOf('} catch (err) {'));
    expect(
      catchBlock,
      'a failed count is being written as a count of zero, on the one screen ' +
        'whose subject is what the wallet did'
    ).not.toMatch(/setBetCount\(/);
    expect(catchBlock).toMatch(/setBetCountError/);
  });
});
