import { describe, it, expect } from 'vitest';
import { collateralStaked, collateralPayouts, eraSplit } from './boardTotals';

describe('collateralStaked', () => {
  it('adds the collateral rows', () => {
    expect(
      collateralStaked([
        { totalStaked: 1, totalsToken: 'USDC' },
        { totalStaked: 2.5, totalsToken: 'USDC' },
      ])
    ).toBe(3.5);
  });

  it('reads a row with no token as collateral, which is what the route sends', () => {
    expect(collateralStaked([{ totalStaked: 1 }])).toBe(1);
  });

  it('leaves ETH and SWIPE out of the total', () => {
    // The whole point. An ETH row landing in a dollar total is how a board ends
    // up claiming 900 dollars staked when one dollar is staked.
    expect(
      collateralStaked([
        { totalStaked: 1, totalsToken: 'USDC' },
        { totalStaked: 0.004, totalsToken: 'ETH' },
        { totalStaked: 900, totalsToken: 'SWIPE' },
      ])
    ).toBe(1);
  });

  it('is zero for an empty board rather than throwing', () => {
    expect(collateralStaked([])).toBe(0);
  });
});

describe('collateralPayouts', () => {
  it('counts and totals collateral payouts', () => {
    expect(
      collateralPayouts([
        { details: { payout: 2, token: 'USDC' } },
        { details: { payout: 0.5, token: 'USDC' } },
      ])
    ).toEqual({ count: 2, total: 2.5 });
  });

  it('excludes payouts in the archived tokens', () => {
    expect(
      collateralPayouts([
        { details: { payout: 2, token: 'USDC' } },
        { details: { payout: 0.03, token: 'ETH' } },
        { details: { payout: 5000, token: 'SWIPE' } },
      ])
    ).toEqual({ count: 1, total: 2 });
  });

  it('separates nothing claimed from a claim of zero', () => {
    // The count is what lets the feed print "none yet" instead of 0.0000, which
    // would be a measurement it never made.
    expect(collateralPayouts([]).count).toBe(0);
    expect(collateralPayouts([{ details: { payout: 0, token: 'USDC' } }]).count).toBe(0);
    expect(collateralPayouts([{ details: {} }, {}]).count).toBe(0);
  });

  it('reads a payout with no token as collateral', () => {
    expect(collateralPayouts([{ details: { payout: 3 } }])).toEqual({ count: 1, total: 3 });
  });
});

describe('eraSplit', () => {
  it('counts archived rows against live ones', () => {
    expect(
      eraSplit([
        { details: { token: 'ETH' } },
        { details: { token: 'SWIPE' } },
        { details: { token: 'USDC' } },
      ])
    ).toEqual({ archived: 2, collateral: 1 });
  });

  it('counts a row with no token as neither, because it is not evidence of an era', () => {
    // A market opening carries no token, so it cannot say which contract it is
    // on. Counting it either way would make the split a guess.
    expect(eraSplit([{}, { details: {} }])).toEqual({ archived: 0, collateral: 0 });
  });
});
