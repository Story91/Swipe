import { describe, it, expect } from 'vitest';
import {
  stakeLegs,
  tokenMarket,
  legSides,
  toDisplayUnits,
  emptyTotals,
  displayTotals,
} from './userStake';
import type { RedisPrediction } from './types/redis';

/**
 * The regression these pin: /api/portfolio and /api/leaderboard decided whether
 * a record was a position by testing `'yesAmount' in stake`. Every record
 * written since V1 nests its amounts one level down, per token, so both routes
 * silently skipped 245 V2 markets and every collateral position and reported
 * the remainder as the user's whole portfolio.
 */

const V2_STAKE = {
  user: '0xabc',
  predictionId: 'pred_v2_7',
  stakedAt: 1700000000,
  contractVersion: 'V2',
  ETH: { yesAmount: 2_000_000_000_000_000_000, noAmount: 0, claimed: false },
  SWIPE: { yesAmount: 0, noAmount: 500_000_000_000_000_000, claimed: true },
};

const V4_STAKE = {
  user: '0xabc',
  predictionId: 'pred_v4_3',
  stakedAt: 1700000000,
  contractVersion: 'V4',
  USDC: {
    yesAmount: 25_000_000,
    noAmount: 0,
    claimed: false,
    weightedYes: 37_500_000,
    weightedNo: 0,
  },
};

const V1_STAKE = {
  user: '0xabc',
  predictionId: 'pred_9',
  stakedAt: 1700000000,
  yesAmount: 1_000_000_000_000_000_000,
  noAmount: 0,
  claimed: false,
};

describe('decoding a stored position', () => {
  it('finds the collateral leg, which three routes could not see at all', () => {
    const legs = stakeLegs(V4_STAKE);
    expect(legs).toHaveLength(1);
    expect(legs[0].tokenType).toBe('USDC');
    expect(legs[0].yesAmount).toBe(25_000_000);
    expect(legs[0].contractVersion).toBe('V4');
  });

  it('splits a V2 record into one leg per token', () => {
    const legs = stakeLegs(V2_STAKE);
    expect(legs.map((l) => l.tokenType)).toEqual(['ETH', 'SWIPE']);
    expect(legs[0].yesAmount).toBe(2_000_000_000_000_000_000);
    expect(legs[1].claimed).toBe(true);
  });

  it('reads the flat V1 shape as a single ETH leg', () => {
    const legs = stakeLegs(V1_STAKE);
    expect(legs).toHaveLength(1);
    expect(legs[0].tokenType).toBe('ETH');
    expect(legs[0].contractVersion).toBe('V1');
  });

  it('is exactly the check that used to drop everything nested', () => {
    // The old guard, run against the records it was applied to. Two of the
    // three shapes fail it, and those two are the entire live product.
    expect('yesAmount' in V2_STAKE).toBe(false);
    expect('yesAmount' in V4_STAKE).toBe(false);
    expect('yesAmount' in V1_STAKE).toBe(true);
    // And what the replacement makes of the same three.
    expect(stakeLegs(V2_STAKE).length).toBe(2);
    expect(stakeLegs(V4_STAKE).length).toBe(1);
    expect(stakeLegs(V1_STAKE).length).toBe(1);
  });

  it('drops a leg a sync wrote as zero rather than counting it as a bet', () => {
    const legs = stakeLegs({
      user: '0xabc',
      predictionId: 'pred_v2_8',
      ETH: { yesAmount: 100, noAmount: 0, claimed: false },
      SWIPE: { yesAmount: 0, noAmount: 0, claimed: false },
    });
    expect(legs.map((l) => l.tokenType)).toEqual(['ETH']);
  });

  it('refuses anything that is not a stake record', () => {
    expect(stakeLegs(null)).toEqual([]);
    expect(stakeLegs('nope')).toEqual([]);
    expect(stakeLegs({ nothing: true })).toEqual([]);
    // Has a user but no amounts anywhere.
    expect(stakeLegs({ user: '0xabc', predictionId: 'pred_1' })).toEqual([]);
  });
});

describe('which pools a leg is settled against', () => {
  const prediction = {
    yesTotalAmount: 10,
    noTotalAmount: 20,
    swipeYesTotalAmount: 30,
    swipeNoTotalAmount: 40,
    usdcYesTotalAmount: 50,
    usdcNoTotalAmount: 60,
    resolved: false,
    cancelled: false,
    outcome: false,
    usdcResolved: true,
    usdcCancelled: false,
    usdcOutcome: true,
  } as unknown as RedisPrediction;

  it('gives each token its own pair, never the ETH pair by default', () => {
    expect(tokenMarket(prediction, 'ETH')).toMatchObject({ yesPool: 10, noPool: 20 });
    expect(tokenMarket(prediction, 'SWIPE')).toMatchObject({ yesPool: 30, noPool: 40 });
    expect(tokenMarket(prediction, 'USDC')).toMatchObject({ yesPool: 50, noPool: 60 });
  });

  it('lets the collateral settle on its own schedule', () => {
    // The collateral contract is a different contract from the V2 one and can
    // be resolved while the V2 market is not. Reading the V2 flags for a
    // collateral position calls a settled market open.
    expect(tokenMarket(prediction, 'USDC').resolved).toBe(true);
    expect(tokenMarket(prediction, 'USDC').outcome).toBe(true);
    expect(tokenMarket(prediction, 'ETH').resolved).toBe(false);
  });

  it('falls back to the shared flags when the collateral has none', () => {
    const noUsdcFlags = { ...prediction, usdcResolved: undefined, usdcOutcome: undefined } as unknown as RedisPrediction;
    expect(tokenMarket(noUsdcFlags, 'USDC').resolved).toBe(false);
  });
});

describe('reading a leg', () => {
  it('picks the side with more on it, and the amount backing that side', () => {
    expect(legSides({ yesAmount: 30, noAmount: 10 } as never)).toMatchObject({
      choice: 'YES',
      staked: 40,
      backing: 30,
    });
    expect(legSides({ yesAmount: 10, noAmount: 30 } as never)).toMatchObject({
      choice: 'NO',
      backing: 30,
    });
  });
});

describe('keeping totals apart by token', () => {
  it('converts each token with its own decimals', () => {
    expect(toDisplayUnits(25_000_000, 'USDC')).toBe(25);
    expect(toDisplayUnits(2_000_000_000_000_000_000, 'ETH')).toBe(2);
  });

  it('never produces one number across tokens, because wei would swallow it', () => {
    // One raw ETH is 1e18 and one raw USDC is 1e6. Summed raw, the 25 USDC
    // below is 0.000000000025% of the answer, which is why the shape is a
    // record per token rather than a single total.
    const totals = emptyTotals();
    totals.ETH.invested = 2_000_000_000_000_000_000;
    totals.USDC.invested = 25_000_000;

    const shown = displayTotals(totals);
    expect(shown.ETH.invested).toBe(2);
    expect(shown.USDC.invested).toBe(25);
    expect(Object.keys(shown).sort()).toEqual(['ETH', 'SWIPE', 'USDC']);
  });
});
