import { describe, it, expect } from 'vitest';
import { estimatePosition } from './positionMath';

/**
 * The figure a user reads as their money.
 *
 * Pinned against the manifesto's own worked example, which is the number the
 * marketing page and the FAQ both quote, so if this drifts the app and the
 * pitch disagree about a payout.
 *
 * That example: a 1000 losing pool, 3% platform and 0.5% creator taken from it,
 * leaving 965. Alice staked 100 at x1.50 for a weighted 150, Ben staked 300 at
 * x1.00 for a weighted 300, so the weighted winning pool is 450. Alice takes
 * 150/450 of 965 and Ben takes 300/450.
 */

const FEES = { platformFeeBps: 300, creatorFeeBps: 50 };

describe('what a winning position takes', () => {
  it('matches the worked example the manifesto prints', () => {
    const alice = estimatePosition({
      mine: 100,
      myWeighted: 150,
      myWeightedPool: 450,
      losingPool: 1000,
      ...FEES,
    });
    expect(alice.winnings).toBeCloseTo(321.67, 2);
    expect(alice.total).toBeCloseTo(421.67, 2);
    expect(alice.multiplier).toBeCloseTo(1.5, 6);

    const ben = estimatePosition({
      mine: 300,
      myWeighted: 300,
      myWeightedPool: 450,
      losingPool: 1000,
      ...FEES,
    });
    expect(ben.winnings).toBeCloseTo(643.33, 2);
    expect(ben.total).toBeCloseTo(943.33, 2);
    expect(ben.multiplier).toBeCloseTo(1, 6);
  });

  it('divides the losing pool by weight, not by stake', () => {
    // Two people staked the same amount; one was early. If this divided on raw
    // stake they would take the same, and the weighting would buy nothing.
    const early = estimatePosition({
      mine: 100, myWeighted: 150, myWeightedPool: 250, losingPool: 1000, ...FEES,
    });
    const late = estimatePosition({
      mine: 100, myWeighted: 100, myWeightedPool: 250, losingPool: 1000, ...FEES,
    });
    expect(early.winnings).toBeGreaterThan(late.winnings);
    expect(early.winnings / late.winnings).toBeCloseTo(1.5, 6);
  });

  it('takes the fees out of the losing side only, never the stake', () => {
    const p = estimatePosition({
      mine: 100, myWeighted: 100, myWeightedPool: 100, losingPool: 100, ...FEES,
    });
    // The whole losing pool, less 3.5%, plus the stake back untouched.
    expect(p.winnings).toBeCloseTo(96.5, 6);
    expect(p.total).toBeCloseTo(196.5, 6);
  });

  it('pays nothing extra when nobody took the other side', () => {
    const p = estimatePosition({
      mine: 50, myWeighted: 75, myWeightedPool: 75, losingPool: 0, ...FEES,
    });
    expect(p.winnings).toBe(0);
    // The stake still comes back. A market with an empty other side is not a
    // loss, and showing zero here would say it was.
    expect(p.total).toBe(50);
  });

  it('answers zero rather than dividing by an empty weighted pool', () => {
    const p = estimatePosition({
      mine: 10, myWeighted: 15, myWeightedPool: 0, losingPool: 500, ...FEES,
    });
    expect(Number.isFinite(p.winnings)).toBe(true);
    expect(p.winnings).toBe(0);
  });

  it('reports a multiplier of 1 for a position with no stake behind it', () => {
    const p = estimatePosition({
      mine: 0, myWeighted: 0, myWeightedPool: 0, losingPool: 0, ...FEES,
    });
    expect(p.multiplier).toBe(1);
    expect(Number.isNaN(p.total)).toBe(false);
  });

  it('reads the fees from its arguments rather than assuming the launch rates', () => {
    // The owner can move them after deploy, and the contract's constructor
    // default is 1% platform, not the 3% the deploy script sets. A hardcoded
    // rate here would be wrong on any chain configured differently.
    const cheap = estimatePosition({
      mine: 100, myWeighted: 100, myWeightedPool: 100, losingPool: 1000,
      platformFeeBps: 0, creatorFeeBps: 0,
    });
    expect(cheap.winnings).toBeCloseTo(1000, 6);
  });
});
