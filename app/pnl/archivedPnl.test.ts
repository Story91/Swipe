import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimatePosition } from '@/lib/positionMath';
import {
  ARCHIVED_ONLY,
  ARCHIVED_PLATFORM_FEE_BPS,
  coverageNotice,
  emptyStateMessage,
  findUserStake,
  isArchivedMarket,
  legFor,
  mapWithLimit,
  plural,
  readStakes,
  rowFor,
  selectMarkets,
  stakesUrl,
  statusOf,
  type ApiPrediction,
  type RouteStake,
} from './archivedPnl';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const STAKES_ROUTE = join(HERE, '..', 'api', 'predictions', '[id]', 'stakes', 'route.ts');

/**
 * The response shape, copied from what the route returns rather than from what
 * the page hoped it returned. Every field name here is load bearing: the three
 * bugs this module exists to kill were all a name that was never in the answer.
 */
function stakesResponse(stakes: RouteStake[]) {
  return {
    success: true,
    data: { predictionId: 'pred_v2_5', stakes, totalStakes: stakes.length },
    timestamp: '2026-08-18T00:00:00.000Z',
  };
}

const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';

function aliceStake(over: Partial<RouteStake> = {}): RouteStake {
  return {
    userId: ALICE.toLowerCase(),
    yesAmount: 0,
    noAmount: 0,
    swipeYesAmount: 0,
    swipeNoAmount: 0,
    claimed: false,
    ...over,
  };
}

const NOW = 1_700_000_000;

function market(over: Partial<ApiPrediction> = {}): ApiPrediction {
  return {
    id: 'pred_v2_5',
    question: 'Will it rain',
    deadline: NOW + 3600,
    contractVersion: 'V2',
    ...over,
  };
}

describe('the stakes route still answers the shape this module reads', () => {
  const source = readFileSync(STAKES_ROUTE, 'utf8');

  it('nests the list under data, which is the depth the pages missed', () => {
    expect(source).toMatch(/data:\s*\{[\s\S]*?stakes:\s*stakesWithVotes/);
  });

  it('keys the wallet as userId, not user', () => {
    expect(source).toMatch(/userId:\s*participant\.toLowerCase\(\)/);
  });

  it('returns the flat wei legs, and no ethStake or swipeStake object', () => {
    expect(source).toMatch(/swipeYesAmount:\s*Number\(swipeYesAmount\)/);
    // The two names the broken page reached for. Neither is a field the route
    // has ever put in an answer, and both fall to undefined without a warning.
    expect(source).not.toMatch(/\bethStake\s*:/);
    expect(source).not.toMatch(/\bswipeStake\s*:/);
  });

  it('still names itself when it cannot price a market', () => {
    expect(source).toContain(`'${ARCHIVED_ONLY}'`);
  });
});

describe('readStakes', () => {
  it('finds the list one level down, under data', () => {
    const answer = readStakes(stakesResponse([aliceStake({ yesAmount: 5 })]));
    expect(answer.stakes).toHaveLength(1);
    expect(answer.archivedOnly).toBe(false);
  });

  it('reads nothing from the shape the broken page assumed', () => {
    // `{ success, stakes }` is what app/pnl/[address]/page.tsx looked for. The
    // route has never sent it, and reading it is how both screens came back
    // empty for everybody.
    const answer = readStakes({ success: true, stakes: [aliceStake({ yesAmount: 5 })] });
    expect(answer.stakes).toEqual([]);
  });

  it('reports the archived marker instead of calling it an empty market', () => {
    const answer = readStakes({
      success: true,
      data: { predictionId: 'pred_v4_1', stakes: [], totalStakers: 0 },
      source: ARCHIVED_ONLY,
    });
    expect(answer.stakes).toEqual([]);
    expect(answer.archivedOnly).toBe(true);
  });

  it('does not confuse a market nobody bet on with one it cannot price', () => {
    const answer = readStakes(stakesResponse([]));
    expect(answer.stakes).toEqual([]);
    expect(answer.archivedOnly).toBe(false);
  });

  it('survives a failure body and a non-object', () => {
    expect(readStakes({ success: false, error: 'boom' }).stakes).toEqual([]);
    expect(readStakes(null).stakes).toEqual([]);
    expect(readStakes(undefined).archivedOnly).toBe(false);
  });
});

describe('findUserStake', () => {
  it('matches on userId', () => {
    const found = findUserStake([aliceStake({ yesAmount: 7 })], ALICE);
    expect(found?.yesAmount).toBe(7);
  });

  it('matches whatever case the caller passes', () => {
    expect(findUserStake([aliceStake()], ALICE.toUpperCase())).toBeDefined();
  });

  it('does not throw on an entry with no userId', () => {
    const junk = [{ yesAmount: 1 } as unknown as RouteStake];
    expect(() => findUserStake(junk, ALICE)).not.toThrow();
    expect(findUserStake(junk, ALICE)).toBeUndefined();
  });

  it('returns nothing for a wallet that is not in the list', () => {
    expect(findUserStake([aliceStake({ yesAmount: 1 })], BOB)).toBeUndefined();
  });
});

describe('isArchivedMarket', () => {
  it('accepts V1 and V2 by version and by id prefix', () => {
    expect(isArchivedMarket({ id: 'pred_v2_5', contractVersion: 'V2' })).toBe(true);
    expect(isArchivedMarket({ id: 'pred_v1_9' })).toBe(true);
    expect(isArchivedMarket({ id: 'whatever', contractVersion: 'V1' })).toBe(true);
  });

  it('rejects the live contract, including a record with no version on it', () => {
    // pred_v4_2 is real and its record carries no contractVersion at all.
    expect(isArchivedMarket({ id: 'pred_v4_2' })).toBe(false);
    expect(isArchivedMarket({ id: 'pred_v4_1', contractVersion: 'V4' })).toBe(false);
    expect(isArchivedMarket({})).toBe(false);
  });
});

describe('selectMarkets', () => {
  const listing: ApiPrediction[] = [
    market({ id: 'pred_v2_1', participants: [ALICE.toUpperCase()] }),
    market({ id: 'pred_v2_2', participants: [BOB] }),
    // Shaped like the real pred_v4_1: nothing in `participants`, the bettors in
    // `usdcParticipants`. A screen that reads one list sees an empty market.
    market({
      id: 'pred_v4_1',
      contractVersion: 'V4',
      participants: [],
      usdcParticipants: [ALICE],
    }),
    market({ id: 'pred_v2_3', participants: [] }),
  ];

  it('asks only about markets this wallet is in', () => {
    const { queryable } = selectMarkets(listing, ALICE);
    expect(queryable.map((p) => p.id)).toEqual(['pred_v2_1']);
  });

  it('counts the live markets it skipped rather than dropping them silently', () => {
    expect(selectMarkets(listing, ALICE).liveElsewhere).toBe(1);
  });

  it('finds a live position through usdcParticipants, not just participants', () => {
    // The only list this wallet appears in is the collateral one, which is the
    // list the old code never read.
    const liveOnly = [listing[2]];
    const picked = selectMarkets(liveOnly, ALICE);
    expect(picked.queryable).toEqual([]);
    expect(picked.liveElsewhere).toBe(1);
  });

  it('is case insensitive about the participant list', () => {
    expect(selectMarkets(listing, ALICE.toLowerCase()).queryable).toHaveLength(1);
  });

  it('returns nothing for a wallet in no market', () => {
    const none = selectMarkets(listing, '0x9999999999999999999999999999999999999999');
    expect(none.queryable).toEqual([]);
    expect(none.liveElsewhere).toBe(0);
  });
});

describe('stakesUrl', () => {
  it('carries the chain, because both deployments number markets from 1', () => {
    expect(stakesUrl('pred_v2_5', 'robinhood')).toBe(
      '/api/predictions/pred_v2_5/stakes?chain=robinhood'
    );
  });

  it('sends no userAddress, which the route never read', () => {
    expect(stakesUrl('pred_v2_5', 'base')).not.toContain('userAddress');
  });
});

describe('legFor', () => {
  const pools = { yesTotalAmount: 300, noTotalAmount: 100 };

  it('gives no leg for a token the wallet did not stake', () => {
    expect(legFor(market(pools), 'SWIPE', 0, 0, NOW)).toBeUndefined();
  });

  it('prices a live position through estimatePosition, at 100 bps', () => {
    const leg = legFor(market(pools), 'ETH', 100, 0, NOW)!;
    const expected = estimatePosition({
      mine: 100,
      myWeighted: 100,
      myWeightedPool: 300,
      losingPool: 100,
      platformFeeBps: ARCHIVED_PLATFORM_FEE_BPS,
      creatorFeeBps: 0,
    }).total;
    expect(leg.potentialPayout).toBeCloseTo(expected, 10);
    expect(leg.potentialProfit).toBeCloseTo(expected - 100, 10);
    expect(leg.isWinner).toBe(false);
  });

  it('pays the archived rate, not the live 300 plus 50', () => {
    const leg = legFor(market(pools), 'ETH', 100, 0, NOW)!;
    const live = estimatePosition({
      mine: 100,
      myWeighted: 100,
      myWeightedPool: 300,
      losingPool: 100,
      platformFeeBps: 300,
      creatorFeeBps: 50,
    }).total;
    expect(leg.potentialPayout).toBeGreaterThan(live);
  });

  it('calls a resolved loss a loss of the stake and nothing else', () => {
    const leg = legFor(
      market({ ...pools, resolved: true, outcome: false }),
      'ETH',
      100,
      0,
      NOW
    )!;
    expect(leg.isWinner).toBe(false);
    expect(leg.potentialPayout).toBe(0);
    expect(leg.potentialProfit).toBe(-100);
  });

  it('hands a cancelled market its stake back, both sides of it', () => {
    const leg = legFor(market({ ...pools, cancelled: true }), 'ETH', 60, 40, NOW)!;
    expect(leg.potentialPayout).toBe(100);
    expect(leg.potentialProfit).toBe(0);
  });

  it('invents no settlement for a market past its deadline and unresolved', () => {
    const leg = legFor(market({ ...pools, deadline: NOW - 1 }), 'ETH', 100, 0, NOW)!;
    expect(leg.potentialPayout).toBe(0);
    expect(leg.potentialProfit).toBe(0);
  });

  it('takes the larger side when a wallet is on both, same as legSides', () => {
    const leg = legFor(
      market({ ...pools, resolved: true, outcome: false }),
      'ETH',
      10,
      90,
      NOW
    )!;
    // Backed NO with 90, and NO won, so this is a win worth more than the 90.
    expect(leg.isWinner).toBe(true);
    expect(leg.potentialPayout).toBeGreaterThan(90);
  });
});

describe('statusOf', () => {
  it('reads resolved, cancelled, expired and active in that order', () => {
    expect(statusOf(market({ resolved: true }), NOW)).toBe('resolved');
    expect(statusOf(market({ cancelled: true }), NOW)).toBe('cancelled');
    expect(statusOf(market({ deadline: NOW - 1 }), NOW)).toBe('expired');
    expect(statusOf(market(), NOW)).toBe('active');
  });
});

describe('rowFor', () => {
  const pools = {
    yesTotalAmount: 300,
    noTotalAmount: 100,
    swipeYesTotalAmount: 500,
    swipeNoTotalAmount: 500,
  };

  it('builds both legs from the flat wei fields', () => {
    const row = rowFor(
      market(pools),
      aliceStake({ yesAmount: 100, swipeNoAmount: 200 }),
      NOW
    )!;
    expect(row.userStakes.ETH?.yesAmount).toBe(100);
    expect(row.userStakes.SWIPE?.noAmount).toBe(200);
    expect(row.status).toBe('active');
  });

  it('gives a SWIPE only position no empty ETH row', () => {
    const row = rowFor(market(pools), aliceStake({ swipeYesAmount: 200 }), NOW)!;
    expect(row.userStakes.ETH).toBeUndefined();
    expect(Object.keys(row.userStakes)).toEqual(['SWIPE']);
  });

  it('returns nothing when the wallet holds no leg at all', () => {
    expect(rowFor(market(pools), aliceStake(), NOW)).toBeNull();
  });
});

describe('mapWithLimit', () => {
  it('keeps the input order whatever order the work finishes in', async () => {
    const delays = [40, 5, 30, 1, 20, 10, 2];
    const out = await mapWithLimit(delays, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(delays.map((ms, i) => `${i}:${ms}`));
  });

  it('never has more than the limit in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithLimit(Array.from({ length: 40 }, (_, i) => i), 6, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBe(6);
  });

  it('runs every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithLimit([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does nothing, and does not hang, on an empty list', async () => {
    await expect(mapWithLimit([], 6, async () => 1)).resolves.toEqual([]);
  });
});

describe('copy', () => {
  const noRows = { rows: [], notCovered: 0, unreadable: 0 };

  it('says the wallet holds live positions instead of saying it holds none', () => {
    const message = emptyStateMessage({ ...noRows, notCovered: 3 })!;
    expect(message).toContain('3 live positions');
    expect(message).not.toMatch(/no predictions found/i);
  });

  it('gets the singular right', () => {
    expect(emptyStateMessage({ ...noRows, notCovered: 1 })).toContain('1 live position on');
    expect(emptyStateMessage({ ...noRows, unreadable: 1 })).toContain('1 market could');
    expect(plural(1, 'market', 'markets')).toBe('1 market');
    expect(plural(0, 'market', 'markets')).toBe('0 markets');
  });

  it('separates a failed request from an empty wallet', () => {
    expect(emptyStateMessage({ ...noRows, unreadable: 2 })).toContain('failed request');
  });

  it('states the scope even when it cannot count the live positions', () => {
    // pred_v4_1 on Base holds a real USDC bet and an empty participants array,
    // so notCovered is 0 for the wallet that placed it. This branch is what
    // that wallet sees, and it must not say the wallet has nothing.
    const message = emptyStateMessage(noRows)!;
    expect(message).toContain('USDC or USDG');
    expect(message).toContain('V1 and V2');
    expect(message).not.toMatch(/no predictions found/i);
  });

  it('says nothing about coverage when the table is empty', () => {
    expect(coverageNotice({ ...noRows, notCovered: 2 })).toBeNull();
  });

  it('warns above a table that is short of the whole picture', () => {
    const row = rowFor(
      market({ yesTotalAmount: 1, noTotalAmount: 1 }),
      aliceStake({ yesAmount: 1 }),
      NOW
    )!;
    expect(coverageNotice({ rows: [row], notCovered: 2, unreadable: 0 })).toContain(
      '2 positions on the current contract are not'
    );
    expect(coverageNotice({ rows: [row], notCovered: 0, unreadable: 0 })).toBeNull();
  });

  it('agrees with itself about one position', () => {
    const row = rowFor(
      market({ yesTotalAmount: 1, noTotalAmount: 1 }),
      aliceStake({ yesAmount: 1 }),
      NOW
    )!;
    const one = coverageNotice({ rows: [row], notCovered: 1, unreadable: 1 })!;
    expect(one).toContain('1 position on the current contract is not');
    expect(one).not.toContain('positions');
    expect(one).toContain('1 market could not be read');
  });

  it('uses no dash anywhere, per the house copy rules', () => {
    const samples = [
      emptyStateMessage(noRows),
      emptyStateMessage({ ...noRows, notCovered: 4 }),
      emptyStateMessage({ ...noRows, unreadable: 4 }),
      coverageNotice({
        rows: [rowFor(market({ yesTotalAmount: 1 }), aliceStake({ yesAmount: 1 }), NOW)!],
        notCovered: 1,
        unreadable: 1,
      }),
    ];
    for (const text of samples) {
      expect(text ?? '').not.toMatch(/[–—]/);
    }
  });
});
