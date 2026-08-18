import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The stakes route answers about archived Base markets or it answers not at all.
 *
 * It looked the market up with a hardcoded 'base' and then read V1 or V2
 * positions off it. Both deployments number their markets from 1, so a request
 * about Robinhood market 5 fetched Base market 5, took that market's participant
 * list, and returned those addresses' V1 positions as market 5's stakes. The PnL
 * page rendered them under the wrong question. It was not an empty answer or an
 * error, it was another market's money.
 *
 * Two things are pinned here. The lookup follows ?chain=, and a market that is
 * not V1 or V2 gets an empty list with a reason rather than a wrong one.
 */

const records = new Map<string, unknown>();
const readContract = vi.fn();

vi.mock('@/lib/chains', () => ({
  createChainPublicClient: () => ({ readContract }),
}));

vi.mock('@/lib/chains/requestChain', () => ({
  chainFromRequest: (request: { url: string }) => {
    const value = new URL(request.url).searchParams.get('chain');
    if (!value) return { ok: true as const, chain: 'base' as const };
    if (value !== 'base' && value !== 'robinhood') {
      return { ok: false as const, error: `unknown chain ${value}` };
    }
    return { ok: true as const, chain: value };
  },
}));

vi.mock('../../../../../lib/redis', () => ({
  redisHelpers: {
    getPrediction: async (id: string, chain: string) => records.get(`${chain}:${id}`) ?? null,
  },
}));

vi.mock('../../../../../lib/contract', () => ({
  CONTRACTS: {
    V1: { address: '0x1111111111111111111111111111111111111111', abi: [] },
    V2: { address: '0x2222222222222222222222222222222222222222', abi: [] },
  },
}));

const { GET } = await import('./route');

const ALICE = '0xaaaa000000000000000000000000000000000001';
const BOB = '0xbbbb000000000000000000000000000000000002';

function record(over: Record<string, unknown> = {}) {
  return {
    id: '5',
    question: 'placeholder',
    participants: [ALICE],
    createdAt: 1_700_000_000,
    contractVersion: 'V2',
    ...over,
  };
}

async function stakes(id: string, query = '') {
  const response = await GET(
    { url: `http://x/api/predictions/${id}/stakes${query}` } as never,
    { params: Promise.resolve({ id }) } as never
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  records.clear();
  readContract.mockReset();
  // yesAmount, noAmount, claimed. BigInt() rather than a literal, because the
  // repo's tsconfig target predates them.
  readContract.mockResolvedValue([BigInt(10), BigInt(0), false]);
});

describe('which market the stakes route is answering about', () => {
  it('reads the chain it was asked for, not always Base', async () => {
    // Same id, two chains, two different markets and two different backers.
    records.set('base:pred_v2_5', record({ participants: [ALICE] }));
    records.set('robinhood:pred_v2_5', record({ participants: [BOB] }));

    const { body } = await stakes('pred_v2_5', '?chain=robinhood');
    expect(body.success).toBe(true);
    expect(body.data.stakes.map((s: { userId: string }) => s.userId)).toEqual([BOB]);
  });

  it('rejects a chain it does not recognise instead of falling back', async () => {
    const { status } = await stakes('pred_v2_5', '?chain=solana');
    expect(status).toBe(400);
  });

  it('404s when the named chain has no such market, rather than borrowing the other one', async () => {
    records.set('base:pred_v2_5', record());
    const { status } = await stakes('pred_v2_5', '?chain=robinhood');
    expect(status).toBe(404);
  });
});

describe('markets this route cannot answer for', () => {
  it('returns an empty list and says why for a live V4 market', async () => {
    records.set('base:7', record({ id: '7', contractVersion: 'V4', participants: [ALICE] }));

    const { body } = await stakes('7');
    expect(body.success).toBe(true);
    expect(body.data.stakes).toEqual([]);
    expect(body.data.totalStakers).toBe(0);
    // The marker is the point: an empty list alone reads as "nobody bet".
    expect(body.source).toBe('archived-contracts-only');
    // And it must not have gone to an archived contract to find that out.
    expect(readContract).not.toHaveBeenCalled();
  });

  it('still answers for the archived markets it was built for', async () => {
    records.set('base:pred_v2_5', record());
    const { body } = await stakes('pred_v2_5');
    expect(body.data.stakes).toHaveLength(1);
    expect(readContract).toHaveBeenCalled();
  });
});
