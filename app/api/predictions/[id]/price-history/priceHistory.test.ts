import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The odds chart is what a trader reads before picking a side, so the numbers
 * behind it have to come from the contract.
 *
 * This endpoint used to take the pools straight out of the request body, with
 * no authentication, which meant anyone could POST any shape they wanted onto
 * any market's chart. These tests pin the fix: the body cannot decide a price.
 */

const store = new Map<string, string>();
const readContract = vi.fn();

vi.mock('@/lib/redis', () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
  },
  REDIS_KEYS: {
    USDC_PRICE_HISTORY: (id: string) => `usdc:price_history:${id}`,
  },
}));

vi.mock('@/lib/chains', () => ({
  DEFAULT_CHAIN_KEY: 'base',
  createChainPublicClient: () => ({ readContract }),
}));

vi.mock('@/lib/chains/market', () => ({
  getMarketContract: () => ({
    address: '0x5C4078BB24f352809B93FF395cA7655835D1CA4a',
    abi: [],
    chainId: 8453,
    collateral: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    explorer: 'https://basescan.org',
  }),
}));

const { POST } = await import('./route');

/** getPrediction's tuple: registered, creator, deadline, yesPool, noPool, ... */
function onChainPools(yes: bigint, no: bigint, registered = true) {
  return [
    registered,
    '0xd4885a5aa53446843cabcde1f35de9b4e906030e',
    123n,
    yes,
    no,
    false,
    false,
    false,
    false,
    0n,
  ] as const;
}

function post(id: string, body: unknown) {
  return POST(
    { json: async () => body } as never,
    { params: Promise.resolve({ id }) }
  );
}

function storedHistory(id: string) {
  const raw = store.get(`usdc:price_history:${id}`);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  store.clear();
  readContract.mockReset();
});

describe('price history POST', () => {
  it('records the pools from the contract, not the ones in the body', async () => {
    readContract.mockResolvedValue(onChainPools(400_000_000n, 1_000_000_000n));

    // A caller claiming a wildly different market shape.
    const response = await post('pred_v3_1', {
      yesPool: 999_999_999_999,
      noPool: 1,
      betSide: 'yes',
      betAmount: 5_000_000,
    });

    expect(response.status).toBe(200);

    const point = storedHistory('pred_v3_1').history[0];
    expect(point.yesPool).toBe(400_000_000);
    expect(point.noPool).toBe(1_000_000_000);
    // 400 / 1400 is 28.57%, so 29 cents. The body asked for ~100.
    expect(point.yesPrice).toBe(29);
    expect(point.noPrice).toBe(71);
  });

  it('keeps betSide and betAmount as annotations, since they decide nothing', async () => {
    readContract.mockResolvedValue(onChainPools(100n, 100n));
    await post('pred_v3_2', { betSide: 'no', betAmount: 250_000 });

    const point = storedHistory('pred_v3_2').history[0];
    expect(point.betSide).toBe('no');
    expect(point.betAmount).toBe(250_000);
    // Equal pools, so the implied odds are even regardless of the annotation.
    expect(point.yesPrice).toBe(50);
  });

  it('works without a body at all', async () => {
    readContract.mockResolvedValue(onChainPools(300n, 100n));
    const response = await POST(
      { json: async () => { throw new Error('no body'); } } as never,
      { params: Promise.resolve({ id: 'pred_v3_3' }) }
    );

    expect(response.status).toBe(200);
    expect(storedHistory('pred_v3_3').history[0].yesPrice).toBe(75);
  });

  it('refuses a market that is not registered on chain', async () => {
    readContract.mockResolvedValue(onChainPools(0n, 0n, false));
    const response = await post('pred_v3_9', { yesPool: 1, noPool: 1 });

    expect(response.status).toBe(404);
    expect(storedHistory('pred_v3_9')).toBeNull();
  });

  it('refuses archived V1 and V2 ids, which have no pools to read', async () => {
    for (const id of ['pred_v2_7', 'pred_v1_7', 'pred_7']) {
      const response = await post(id, { yesPool: 1, noPool: 1 });
      expect(response.status).toBe(400);
      expect(storedHistory(id)).toBeNull();
    }
    expect(readContract).not.toHaveBeenCalled();
  });

  it('refuses an id it cannot parse rather than guessing a market number', async () => {
    const response = await post('../../etc/passwd', { yesPool: 1, noPool: 1 });
    expect(response.status).toBe(400);
    expect(readContract).not.toHaveBeenCalled();
  });

  it('does not append a second point when the pools have not moved', async () => {
    readContract.mockResolvedValue(onChainPools(500n, 500n));

    await post('pred_v3_4', {});
    await post('pred_v3_4', {});
    await post('pred_v3_4', {});

    expect(storedHistory('pred_v3_4').history).toHaveLength(1);
  });

  it('appends once the pools actually move', async () => {
    readContract.mockResolvedValue(onChainPools(500n, 500n));
    await post('pred_v3_5', {});

    readContract.mockResolvedValue(onChainPools(900n, 500n));
    await post('pred_v3_5', {});

    const history = storedHistory('pred_v3_5').history;
    expect(history).toHaveLength(2);
    expect(history[1].yesPool).toBe(900);
  });
});
