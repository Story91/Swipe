import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * What the portfolio actually returns, against records in the shapes Redis
 * really holds.
 *
 * The route decided whether a record was a position by testing
 * `'yesAmount' in stake`. Only the flat V1 shape has that key. Every record
 * written since nests its amounts under a token, so all 245 V2 markets and
 * every collateral position were skipped in silence, and the remainder was
 * presented as the user's whole portfolio. The numbers were not wrong, they
 * were of a different portfolio.
 *
 * These run the route rather than reading its source, because the failure was
 * behavioural: the code looked reasonable and returned the wrong set.
 */

const store = new Map<string, unknown>();
const predictions: unknown[] = [];

vi.mock('@/lib/redis', () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return 'OK';
    },
  },
  redisHelpers: {
    getAllPredictions: async () => predictions,
  },
  REDIS_KEYS: {
    PREDICTION: (id: string) => `prediction:${id}`,
    USER_STAKES: (user: string, id: string) => `user_stakes:${user}:${id}`,
  },
}));

const { GET } = await import('./route');

const USER = '0xabc';

/** A market with a pool on all three tokens, so a wrong pair is detectable. */
function market(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    question: `Will ${id} happen?`,
    category: 'Crypto',
    imageUrl: '',
    deadline: Math.floor(Date.now() / 1000) + 86_400,
    // ETH pools, 18 decimals.
    yesTotalAmount: 4e18,
    noTotalAmount: 4e18,
    swipeYesTotalAmount: 8e18,
    swipeNoTotalAmount: 8e18,
    // Collateral pools, 6 decimals.
    usdcYesTotalAmount: 50_000_000,
    usdcNoTotalAmount: 50_000_000,
    resolved: false,
    cancelled: false,
    participants: [USER],
    ...over,
  };
}

function stakeAt(predictionId: string, body: Record<string, unknown>) {
  store.set(`user_stakes:${USER}:${predictionId}`, JSON.stringify({
    user: USER,
    predictionId,
    stakedAt: 1_700_000_000,
    ...body,
  }));
}

async function portfolio() {
  const response = await GET({ url: `http://x/api/portfolio?userAddress=${USER}` } as never);
  const json = await response.json();
  expect(json.success).toBe(true);
  return json.data as {
    portfolio: Array<Record<string, unknown>>;
    stats: Record<string, never> & Record<string, unknown>;
  };
}

beforeEach(() => {
  store.clear();
  predictions.length = 0;
});

describe('positions the portfolio can see', () => {
  it('returns a collateral position, which it used to drop entirely', async () => {
    predictions.push(market('pred_v4_1'));
    stakeAt('pred_v4_1', {
      contractVersion: 'V4',
      USDC: { yesAmount: 25_000_000, noAmount: 0, claimed: false },
    });

    const { portfolio: rows } = await portfolio();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe('USDC');
    // Readable units, not the raw 25000000 the record holds.
    expect(rows[0].stakeAmount).toBe(25);
    expect(rows[0].choice).toBe('YES');
  });

  it('returns one row per token on a market held in two', async () => {
    predictions.push(market('pred_v2_1'));
    stakeAt('pred_v2_1', {
      contractVersion: 'V2',
      ETH: { yesAmount: 2e18, noAmount: 0, claimed: false },
      SWIPE: { yesAmount: 0, noAmount: 4e18, claimed: false },
    });

    const { portfolio: rows } = await portfolio();
    expect(rows.map((r) => r.token)).toEqual(['ETH', 'SWIPE']);
    expect(rows[0].stakeAmount).toBe(2);
    expect(rows[1].stakeAmount).toBe(4);
    expect(rows[1].choice).toBe('NO');
  });

  it('still reads the flat V1 shape', async () => {
    predictions.push(market('pred_9'));
    stakeAt('pred_9', { yesAmount: 1e18, noAmount: 0, claimed: false });

    const { portfolio: rows } = await portfolio();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe('ETH');
    expect(rows[0].stakeAmount).toBe(1);
  });
});

describe('which pools a row is priced against', () => {
  it('prices a collateral row off the collateral pools, not the ETH ones', async () => {
    // Deliberately lopsided so the two answers cannot coincide: even collateral
    // pools pay 2x, while the ETH pools here would pay 5x.
    predictions.push(
      market('pred_v4_2', { yesTotalAmount: 1e18, noTotalAmount: 4e18 })
    );
    stakeAt('pred_v4_2', {
      contractVersion: 'V4',
      USDC: { yesAmount: 10_000_000, noAmount: 0, claimed: false },
    });

    const { portfolio: rows } = await portfolio();
    expect(rows[0].token).toBe('USDC');
    /**
     * 10 staked, the opposite pool equals this side's pool, so the whole losing
     * pool is this position's share. The contract takes 3% platform and 0.5%
     * creator out of that before dividing, so the payout is 10 + 10 * 0.965.
     *
     * This asserted a flat 20 while the route computed the payout with no fee
     * at all. Both were wrong together, which is exactly how a test stops being
     * a check and becomes a second copy of the bug.
     */
    expect(rows[0].potentialPayout).toBeCloseTo(19.65, 6);
    expect(rows[0].yesPool).toBe(50);
    expect(rows[0].noPool).toBe(50);
  });

  it('settles a collateral row on the collateral flags', async () => {
    // Resolved on the collateral contract and open on the V2 one. Reading the
    // shared flags would call this row active and never count the win.
    predictions.push(
      market('pred_v4_3', {
        resolved: false,
        usdcResolved: true,
        usdcOutcome: true,
        usdcCancelled: false,
      })
    );
    stakeAt('pred_v4_3', {
      contractVersion: 'V4',
      USDC: { yesAmount: 10_000_000, noAmount: 0, claimed: false },
    });

    const { portfolio: rows, stats } = await portfolio();
    expect(rows[0].status).toBe('won');
    expect(rows[0].outcome).toBe('YES');
    expect(stats.wonBets).toBe(1);
    expect(stats.activeBets).toBe(0);
  });
});

describe('totals', () => {
  it('never adds wei to a six decimal token', async () => {
    // One ETH raw is 1e18 and ten USDC raw is 1e7. Summed raw, the collateral
    // leg is invisible; summed after conversion, 1 ETH and 10 dollars become
    // "11" of nothing. So they stay apart and the headline names its token.
    predictions.push(market('pred_v2_5'), market('pred_v4_5'));
    stakeAt('pred_v2_5', { ETH: { yesAmount: 1e18, noAmount: 0, claimed: false } });
    stakeAt('pred_v4_5', { USDC: { yesAmount: 10_000_000, noAmount: 0, claimed: false } });

    const { stats } = await portfolio();
    expect(stats.totalsToken).toBe('USDC');
    expect(stats.totalInvested).toBe(10);
    expect((stats.byToken as never as Record<string, { invested: number }>).ETH.invested).toBe(1);
    expect((stats.byToken as never as Record<string, { invested: number }>).USDC.invested).toBe(10);
  });

  it('counts bets across every token, because that is a fact about the user', async () => {
    predictions.push(market('pred_v2_6'));
    stakeAt('pred_v2_6', {
      ETH: { yesAmount: 1e18, noAmount: 0, claimed: false },
      SWIPE: { yesAmount: 1e18, noAmount: 0, claimed: false },
    });

    const { stats } = await portfolio();
    expect(stats.activeBets).toBe(2);
  });
});
