import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The batch price-history route.
 *
 * The pure parsing lives in lib/priceHistoryBatch and is tested there. What is
 * tested here is that the route actually applies it, and that the whole page
 * is one Redis round trip rather than 24. A route that validated nothing and
 * looped one get per id would pass every test in that other file.
 */

const store = new Map<string, string>();
const mget = vi.fn(async (...keys: string[]) => keys.map((key) => store.get(key) ?? null));

vi.mock('@/lib/redis', () => ({
  redis: {
    mget: (...keys: string[]) => mget(...keys),
  },
  REDIS_KEYS: {
    // Mirrors the real helper: Base is the identity namespace, everything else
    // is prefixed.
    USDC_PRICE_HISTORY: (id: string, chain?: string) =>
      `${chain && chain !== 'base' ? `${chain}:` : ''}usdc:price_history:${id}`,
  },
}));

const { GET } = await import('./route');
const { MAX_BATCH_IDS } = await import('@/lib/priceHistoryBatch');

function get(query: string) {
  return GET({ url: `http://localhost/api/predictions/price-history/batch${query}` } as never);
}

function write(key: string, history: { timestamp: number; yesPrice: number }[], lastUpdated = 5) {
  store.set(key, JSON.stringify({ predictionId: 'whatever', history, lastUpdated }));
}

beforeEach(() => {
  store.clear();
  mget.mockClear();
});

describe('batch price history GET', () => {
  it('answers a page of ids in one mget', async () => {
    write('usdc:price_history:pred_v4_1', [{ timestamp: 10, yesPrice: 60 }]);
    write('usdc:price_history:pred_v4_2', [{ timestamp: 20, yesPrice: 40 }]);

    const response = await get('?ids=pred_v4_1,pred_v4_2,pred_v4_3');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget).toHaveBeenCalledWith(
      'usdc:price_history:pred_v4_1',
      'usdc:price_history:pred_v4_2',
      'usdc:price_history:pred_v4_3'
    );

    expect(body.data.histories).toEqual([
      { predictionId: 'pred_v4_1', history: [{ timestamp: 10, yesPrice: 60 }], lastUpdated: 5 },
      { predictionId: 'pred_v4_2', history: [{ timestamp: 20, yesPrice: 40 }], lastUpdated: 5 },
      // Nothing cached. This is a cache read, so it comes back empty rather
      // than reaching for the contract the way the single route does.
      { predictionId: 'pred_v4_3', history: [], lastUpdated: 0 },
    ]);
  });

  it('reads the chain the caller named, and Base when it named none', async () => {
    write('robinhood:usdc:price_history:pred_v4_1', [{ timestamp: 1, yesPrice: 70 }]);
    write('usdc:price_history:pred_v4_1', [{ timestamp: 1, yesPrice: 30 }]);

    const onRobinhood = await (await get('?ids=pred_v4_1&chain=robinhood')).json();
    expect(onRobinhood.data.chain).toBe('robinhood');
    expect(onRobinhood.data.histories[0].history[0].yesPrice).toBe(70);

    const onBase = await (await get('?ids=pred_v4_1')).json();
    expect(onBase.data.chain).toBe('base');
    expect(onBase.data.histories[0].history[0].yesPrice).toBe(30);
  });

  it('refuses a chain it does not have rather than serving Base under its name', async () => {
    const response = await get('?ids=pred_v4_1&chain=ethereum');
    expect(response.status).toBe(400);
    expect(mget).not.toHaveBeenCalled();
  });

  it('refuses more ids than the cap, and reads nothing', async () => {
    const ids = Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => `pred_v4_${i + 1}`);
    const response = await get(`?ids=${ids.join(',')}`);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain(`${MAX_BATCH_IDS}`);
    expect(mget).not.toHaveBeenCalled();
  });

  it('refuses an id it cannot parse, and reads nothing', async () => {
    const response = await get('?ids=pred_v4_1,../../etc/passwd');
    expect(response.status).toBe(400);
    expect(mget).not.toHaveBeenCalled();
  });

  it('refuses a request with no ids at all', async () => {
    const response = await get('');
    expect(response.status).toBe(400);
    expect(mget).not.toHaveBeenCalled();
  });

  it('lets one unreadable record cost only its own card', async () => {
    store.set('usdc:price_history:pred_v4_1', '{ this is not json');
    write('usdc:price_history:pred_v4_2', [{ timestamp: 1, yesPrice: 55 }]);

    const response = await get('?ids=pred_v4_1,pred_v4_2');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.histories[0]).toEqual({
      predictionId: 'pred_v4_1',
      history: [],
      lastUpdated: 0,
    });
    expect(body.data.histories[1].history).toHaveLength(1);
  });

  it('reports a Redis failure as a 500, not as a page of empty markets', async () => {
    mget.mockRejectedValueOnce(new Error('upstash is down'));
    const response = await get('?ids=pred_v4_1');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});
