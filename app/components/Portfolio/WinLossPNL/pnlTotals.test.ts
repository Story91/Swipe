import { describe, it, expect } from 'vitest';
import { estimatePosition } from '@/lib/positionMath';
import {
  summarisePnl,
  settlementOf,
  recordOn,
  outcomeOf,
  formatTokenAmount,
  formatSignedAmount,
  formatRoi,
  type PnlPrediction,
  type PnlStakeLeg,
} from './pnlTotals';

/**
 * The rates the two contracts actually charge, used to build the legs below
 * the way the pages that feed the card build them.
 *
 * PredictionMarket_V2 takes 100 bps from the losing pool and pays no creator
 * cut. PredictionMarket_V4 takes 300 plus 50, also from the losing pool only,
 * and weights the winner's share. These are the fixtures' rates, not something
 * the card decides.
 */
const V2 = { platformFeeBps: 100, creatorFeeBps: 0 };
const V4 = { platformFeeBps: 300, creatorFeeBps: 50 };

const USDC = 1_000_000;
const WEI = 1_000_000_000_000_000_000;

/** A winning leg, priced by the same function every other surface prices with. */
function winningLeg(params: {
  backing: number;
  weighted: number;
  weightedPool: number;
  losingPool: number;
  fees: { platformFeeBps: number; creatorFeeBps: number };
}): PnlStakeLeg {
  const estimate = estimatePosition({
    mine: params.backing,
    myWeighted: params.weighted,
    myWeightedPool: params.weightedPool,
    losingPool: params.losingPool,
    ...params.fees,
  });
  return {
    yesAmount: params.backing,
    noAmount: 0,
    potentialPayout: estimate.total,
    potentialProfit: estimate.total - params.backing,
    isWinner: true,
  };
}

function market(over: Partial<PnlPrediction>): PnlPrediction {
  return {
    id: '1',
    question: 'Will it?',
    resolved: false,
    cancelled: false,
    status: 'active',
    ...over,
  };
}

describe('summarisePnl, collateral', () => {
  /**
   * 25 dollars in early on a market whose other side holds 100.
   *
   * Early is x1.50, so the weighted stake is 37.50 and it is the only weight in
   * its pool. V4 takes 350 bps of the 100 dollar losing pool, leaving 96.50 to
   * hand over, and the stake comes back on top. The card must read 121.50, not
   * 121500000, and not 0.0000000001215.
   */
  it('reads six decimals, not eighteen', () => {
    const leg = winningLeg({
      backing: 25 * USDC,
      weighted: 37.5 * USDC,
      weightedPool: 37.5 * USDC,
      losingPool: 100 * USDC,
      fees: V4,
    });
    expect(leg.potentialPayout).toBe(121.5 * USDC);

    const summary = summarisePnl(
      [market({ userStakes: { USDC: leg }, status: 'resolved', usdcResolved: true })],
      'USDC'
    );

    expect(summary.staked).toBeCloseTo(25, 6);
    expect(summary.payout).toBeCloseTo(121.5, 6);
    expect(summary.profit).toBeCloseTo(96.5, 6);
    expect(summary.roi).toBeCloseTo(386, 6);
    expect(summary.bets).toBe(1);
    expect(summary.wins).toBe(1);
    expect(formatTokenAmount(summary.payout, 'USDC')).toBe('121.50');
  });
});

describe('summarisePnl, archived legs', () => {
  /**
   * Half an ETH against a full one, on V2, which takes 1% and weights nothing.
   * 0.99 of the losing pool lands on top of the stake, so 1.49 ETH.
   */
  it('reads eighteen decimals on ETH', () => {
    const leg = winningLeg({
      backing: 0.5 * WEI,
      weighted: 0.5 * WEI,
      weightedPool: 0.5 * WEI,
      losingPool: 1 * WEI,
      fees: V2,
    });

    const summary = summarisePnl(
      [market({ userStakes: { ETH: leg }, status: 'resolved', resolved: true })],
      'ETH'
    );

    expect(summary.staked).toBeCloseTo(0.5, 9);
    expect(summary.payout).toBeCloseTo(1.49, 9);
    expect(summary.profit).toBeCloseTo(0.99, 9);
    expect(formatTokenAmount(summary.payout, 'ETH')).toBe('1.490000');
  });

  it('abbreviates SWIPE', () => {
    const leg: PnlStakeLeg = {
      yesAmount: 2_500_000 * WEI,
      noAmount: 0,
      potentialPayout: 4_950_000 * WEI,
      potentialProfit: 2_450_000 * WEI,
      isWinner: true,
    };

    const summary = summarisePnl(
      [market({ userStakes: { SWIPE: leg }, status: 'resolved', resolved: true })],
      'SWIPE'
    );

    expect(summary.staked).toBeCloseTo(2_500_000, 3);
    expect(formatTokenAmount(summary.payout, 'SWIPE')).toBe('4.95M');
  });
});

describe('summarisePnl keeps tokens apart', () => {
  /**
   * The bug this whole module exists to stop. One ETH is 1e18 raw and one
   * dollar is 1e6, so anything that adds them reports the dollar as a rounding
   * error and calls the total ETH.
   */
  it('never adds a wei figure to a six decimal one', () => {
    const eth: PnlStakeLeg = {
      yesAmount: 1 * WEI,
      noAmount: 0,
      potentialPayout: 2 * WEI,
      potentialProfit: 1 * WEI,
      isWinner: true,
    };
    const usdc: PnlStakeLeg = {
      yesAmount: 1 * USDC,
      noAmount: 0,
      potentialPayout: 2 * USDC,
      potentialProfit: 1 * USDC,
      isWinner: true,
    };
    const both = [
      market({ userStakes: { ETH: eth, USDC: usdc }, status: 'resolved', resolved: true, usdcResolved: true }),
    ];

    expect(summarisePnl(both, 'ETH').staked).toBeCloseTo(1, 9);
    expect(summarisePnl(both, 'USDC').staked).toBeCloseTo(1, 9);
    expect(summarisePnl(both, 'ETH').bets).toBe(1);
    expect(summarisePnl(both, 'USDC').bets).toBe(1);
  });

  it('reports nothing for a token the user does not hold', () => {
    const usdc: PnlStakeLeg = {
      yesAmount: 10 * USDC,
      noAmount: 0,
      potentialPayout: 0,
      potentialProfit: 0,
      isWinner: false,
    };
    const summary = summarisePnl([market({ userStakes: { USDC: usdc } })], 'SWIPE');
    expect(summary).toMatchObject({ staked: 0, payout: 0, profit: 0, roi: 0, bets: 0 });
  });

  it('drops a leg a sync wrote as zeros', () => {
    const empty: PnlStakeLeg = {
      yesAmount: 0,
      noAmount: 0,
      potentialPayout: 0,
      potentialProfit: 0,
      isWinner: false,
    };
    expect(summarisePnl([market({ userStakes: { SWIPE: empty } })], 'SWIPE').bets).toBe(0);
  });
});

describe('settlement is read per token', () => {
  const won: PnlStakeLeg = {
    yesAmount: 5 * USDC,
    noAmount: 0,
    potentialPayout: 9 * USDC,
    potentialProfit: 4 * USDC,
    isWinner: true,
  };
  const lost: PnlStakeLeg = {
    yesAmount: 3 * WEI,
    noAmount: 0,
    potentialPayout: 0,
    potentialProfit: -3 * WEI,
    isWinner: false,
  };

  it('counts a collateral win the archived pool has not caught up with', () => {
    const p = market({
      status: 'active',
      resolved: false,
      usdcResolved: true,
      userStakes: { USDC: won, ETH: lost },
    });
    expect(settlementOf(p, 'USDC').resolved).toBe(true);
    expect(settlementOf(p, 'ETH').resolved).toBe(false);
    expect(summarisePnl([p], 'USDC').wins).toBe(1);
    expect(summarisePnl([p], 'ETH')).toMatchObject({ wins: 0, losses: 0 });
  });

  it('counts a cancelled market as neither a win nor a loss', () => {
    const refunded: PnlStakeLeg = {
      yesAmount: 5 * USDC,
      noAmount: 0,
      potentialPayout: 5 * USDC,
      potentialProfit: 0,
      isWinner: false,
    };
    const p = market({
      status: 'cancelled',
      usdcResolved: true,
      usdcCancelled: true,
      cancelled: true,
      userStakes: { USDC: refunded },
    });
    expect(summarisePnl([p], 'USDC')).toMatchObject({ wins: 0, losses: 0, bets: 1 });
  });

  it('counts a settled miss as a loss', () => {
    const p = market({
      status: 'resolved',
      resolved: true,
      usdcResolved: true,
      userStakes: {
        USDC: {
          yesAmount: 8 * USDC,
          noAmount: 0,
          potentialPayout: 0,
          potentialProfit: -8 * USDC,
          isWinner: false,
        },
      },
    });
    const summary = summarisePnl([p], 'USDC');
    expect(summary).toMatchObject({ wins: 0, losses: 1 });
    expect(summary.profit).toBeCloseTo(-8, 6);
    expect(formatSignedAmount(summary.profit, 'USDC')).toBe('-8.00');
  });
});

describe('recordOn and outcomeOf', () => {
  const collateralWin: PnlStakeLeg = {
    yesAmount: 5 * USDC,
    noAmount: 0,
    potentialPayout: 9 * USDC,
    potentialProfit: 4 * USDC,
    isWinner: true,
  };
  const swipeMiss: PnlStakeLeg = {
    yesAmount: 100 * WEI,
    noAmount: 0,
    potentialPayout: 0,
    potentialProfit: -100 * WEI,
    isWinner: false,
  };

  it('puts a market won in one token and lost in another on both lists', () => {
    const p = market({
      status: 'resolved',
      resolved: true,
      outcome: false,
      usdcResolved: true,
      usdcOutcome: true,
      userStakes: { USDC: collateralWin, SWIPE: swipeMiss },
    });
    expect(recordOn(p)).toEqual({ won: true, lost: true });
  });

  it('sees a collateral win the archived contract has not called', () => {
    const p = market({
      status: 'active',
      resolved: false,
      usdcResolved: true,
      usdcOutcome: true,
      userStakes: { USDC: collateralWin },
    });
    expect(recordOn(p)).toEqual({ won: true, lost: false });
    expect(outcomeOf(p, 'USDC')).toBe(true);
    expect(outcomeOf(p, 'ETH')).toBeUndefined();
  });

  it('leaves an unsettled market off both lists', () => {
    const p = market({ userStakes: { USDC: collateralWin } });
    expect(recordOn(p)).toEqual({ won: false, lost: false });
  });
});

describe('formatting', () => {
  it('groups thousands of dollars and keeps the cents', () => {
    expect(formatTokenAmount(1234.5, 'USDC')).toBe('1,234.50');
    expect(formatTokenAmount(0, 'USDC')).toBe('0.00');
  });

  it('does not print a minus in front of a rounded zero', () => {
    expect(formatTokenAmount(-0.001, 'USDC')).toBe('0.00');
    expect(formatSignedAmount(0.0000001, 'USDC')).toBe('+0.00');
  });

  it('signs a gain and leaves a loss alone', () => {
    expect(formatSignedAmount(12.5, 'USDC')).toBe('+12.50');
    expect(formatSignedAmount(-12.5, 'USDC')).toBe('-12.50');
    expect(formatRoi(386)).toBe('+386%');
    expect(formatRoi(-40)).toBe('-40%');
    expect(formatRoi(0)).toBe('0%');
  });
});
