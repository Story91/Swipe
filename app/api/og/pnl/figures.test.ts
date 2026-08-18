import { describe, expect, it } from 'vitest';
import { formatLegAmount, pnlFigures, type PnlPosition } from './figures';
import type { RedisPrediction } from '@/lib/types/redis';
import type { StakeLeg } from '@/lib/userStake';

/**
 * The card that prints these numbers goes out to a public feed, so the thing
 * being tested is not that a payout is pretty but that two tokens are never
 * added together. A stake is stored raw: one ETH is 1e18 and one dollar of
 * collateral is 1e6, so a single "total staked" is the wei leg wearing whatever
 * currency label the renderer felt like.
 */

const LAUNCH_FEES = { platformBps: 300, creatorBps: 50 };

const HOUR = 3600;
const NOW = 1_760_000_000;

function market(over: Partial<RedisPrediction>): RedisPrediction {
  return {
    id: 'm1',
    question: 'Will it?',
    description: '',
    category: 'crypto',
    imageUrl: '',
    includeChart: false,
    endDate: '',
    endTime: '',
    deadline: NOW + 24 * HOUR,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: NOW - 24 * HOUR,
    creator: '0xcreator',
    verified: true,
    approved: true,
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    ...over,
  };
}

function leg(over: Partial<StakeLeg> & { tokenType: StakeLeg['tokenType'] }): StakeLeg {
  return {
    user: '0xuser',
    predictionId: 'm1',
    yesAmount: 0,
    noAmount: 0,
    claimed: false,
    stakedAt: NOW - 12 * HOUR,
    weightedYes: 0,
    weightedNo: 0,
    ...over,
  };
}

/** One ETH on the winning side of a settled archived market. */
const ethWin: PnlPosition = {
  prediction: market({
    id: 'eth-market',
    deadline: NOW - HOUR,
    resolved: true,
    outcome: true,
    yesTotalAmount: 2e18,
    noTotalAmount: 1e18,
  }),
  leg: leg({ predictionId: 'eth-market', tokenType: 'ETH', yesAmount: 1e18 }),
};

/** Twenty five dollars on the NO side of a live collateral market. */
const collateralOpen: PnlPosition = {
  prediction: market({
    id: 'usdc-market',
    deadline: NOW + 6 * HOUR,
    usdcYesTotalAmount: 75e6,
    usdcNoTotalAmount: 25e6,
  }),
  leg: leg({ predictionId: 'usdc-market', tokenType: 'USDC', noAmount: 25e6 }),
};

describe('pnlFigures', () => {
  it('keeps an ETH leg and a collateral leg apart', () => {
    const figures = pnlFigures([ethWin, collateralOpen], LAUNCH_FEES, NOW);

    expect(figures.byToken.ETH.invested).toBe(1);
    expect(figures.byToken.USDC.invested).toBe(25);
    expect(figures.byToken.SWIPE.invested).toBe(0);
  });

  it('never sums across tokens for the headline', () => {
    const figures = pnlFigures([ethWin, collateralOpen], LAUNCH_FEES, NOW);

    expect(figures.headline).toBe('USDC');
    expect(figures.staked).toBe(25);

    // The two ways the old card got this wrong. 26 is the display-unit sum.
    // 1.000000025 is what `(1e18 + 25e6) / 1e18` prints, which is the ETH leg
    // with the whole collateral position rounded into its last digits.
    expect(figures.staked).not.toBe(26);
    expect(figures.staked).not.toBeCloseTo((1e18 + 25e6) / 1e18, 6);
  });

  it('names the other tokens rather than folding them in', () => {
    const figures = pnlFigures([ethWin, collateralOpen], LAUNCH_FEES, NOW);

    expect(figures.others).toEqual(['ETH']);
    expect(figures.bets).toBe(2);
    expect(figures.wins).toBe(1);
    expect(figures.losses).toBe(0);
  });

  it('reports profit and ROI in the headline token only', () => {
    const figures = pnlFigures([ethWin, collateralOpen], LAUNCH_FEES, NOW);

    // 25 on NO, the whole weighted NO side, against a 75 YES pool less 350 bps.
    expect(figures.profit).toBeCloseTo(72.375, 6);
    expect(figures.payout).toBeCloseTo(97.375, 6);
    expect(figures.roi).toBeCloseTo(289.5, 6);

    // The ETH leg is still reported, in ETH, and it is not in the headline.
    expect(figures.byToken.ETH.profit).toBeCloseTo(0.4825, 10);
  });

  it('takes both fees off the losing pool, not off the stake', () => {
    const figures = pnlFigures([ethWin], LAUNCH_FEES, NOW);

    expect(figures.headline).toBe('ETH');
    expect(figures.staked).toBe(1);
    // Half of a 1 ETH losing pool, less 350 bps.
    expect(figures.byToken.ETH.profit).toBeCloseTo(0.4825, 10);
    // Not the fee-free 0.5, and not the 1 percent the card used to hardcode.
    expect(figures.byToken.ETH.profit).not.toBeCloseTo(0.5, 6);
    expect(figures.byToken.ETH.profit).not.toBeCloseTo(0.495, 6);
  });

  it('falls back to an archived token when there is no collateral position', () => {
    const swipe: PnlPosition = {
      prediction: market({
        id: 'swipe-market',
        deadline: NOW + HOUR,
        swipeYesTotalAmount: 400_000e18,
        swipeNoTotalAmount: 100_000e18,
      }),
      leg: leg({ predictionId: 'swipe-market', tokenType: 'SWIPE', yesAmount: 200_000e18 }),
    };

    const figures = pnlFigures([swipe], LAUNCH_FEES, NOW);

    expect(figures.headline).toBe('SWIPE');
    expect(figures.staked).toBeCloseTo(200_000, 6);
    expect(figures.others).toEqual([]);
  });

  it('books an unresolved market past its deadline as neither won nor lost', () => {
    const stalled: PnlPosition = {
      prediction: market({
        id: 'stalled',
        deadline: NOW - HOUR,
        usdcYesTotalAmount: 10e6,
        usdcNoTotalAmount: 10e6,
      }),
      leg: leg({ predictionId: 'stalled', tokenType: 'USDC', yesAmount: 10e6 }),
    };

    const figures = pnlFigures([stalled], LAUNCH_FEES, NOW);

    expect(figures.staked).toBe(10);
    expect(figures.profit).toBe(0);
    expect(figures.wins).toBe(0);
    expect(figures.losses).toBe(0);
  });

  it('counts a lost market as the stake and nothing worse', () => {
    const lost: PnlPosition = {
      prediction: market({
        id: 'lost',
        deadline: NOW - HOUR,
        usdcResolved: true,
        usdcOutcome: false,
        usdcYesTotalAmount: 40e6,
        usdcNoTotalAmount: 60e6,
      }),
      leg: leg({ predictionId: 'lost', tokenType: 'USDC', yesAmount: 40e6 }),
    };

    const figures = pnlFigures([lost], LAUNCH_FEES, NOW);

    expect(figures.losses).toBe(1);
    expect(figures.profit).toBe(-40);
    expect(figures.payout).toBe(0);
    expect(figures.roi).toBeCloseTo(-100, 6);
  });

  it('has no figures at all for a wallet with no positions', () => {
    const figures = pnlFigures([], LAUNCH_FEES, NOW);

    expect(figures.headline).toBe('USDC');
    expect(figures.staked).toBe(0);
    expect(figures.roi).toBe(0);
    expect(figures.others).toEqual([]);
  });
});

describe('formatLegAmount', () => {
  it('quotes collateral to the cent', () => {
    expect(formatLegAmount(25, 'USDC')).toBe('25.00');
    expect(formatLegAmount(1500, 'USDC')).toBe('1.5k');
  });

  it('does not round a small ETH position away', () => {
    expect(formatLegAmount(0.0004, 'ETH')).toBe('0.00040000');
    expect(formatLegAmount(1.5, 'ETH')).toBe('1.5000');
  });

  it('counts SWIPE in thousands', () => {
    expect(formatLegAmount(200_000, 'SWIPE')).toBe('200K');
    expect(formatLegAmount(2_500_000, 'SWIPE')).toBe('2.5M');
  });
});
