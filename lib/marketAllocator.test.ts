import { describe, it, expect } from 'vitest';
import {
  allocateV3MarketId,
  seedV3Counter,
  MarketIdUnavailableError,
  V3_ID_COUNTER,
  type AllocatorStore,
} from './marketAllocator';

const predictionKey = (id: string) => `prediction:${id}`;

/** An in-memory stand-in whose INCR is atomic the way Redis's is. */
function makeStore(seed: Record<string, unknown> = {}): AllocatorStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    async incr(key) {
      const next = Number(data[key] ?? 0) + 1;
      data[key] = next;
      return next;
    },
    async get(key) {
      return key in data ? data[key] : null;
    },
    async set(key, value) {
      data[key] = value;
      return 'OK';
    },
  };
}

describe('allocating a V3 market number', () => {
  it('starts at 1 and never repeats', async () => {
    const store = makeStore();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await allocateV3MarketId(store, predictionKey));
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives two callers racing for an id two different numbers', async () => {
    // The failure this exists to prevent: a read-then-write allocator hands the
    // same number to both, both records are written, the resolver registers one,
    // and bets from either card settle against the same on-chain market.
    const store = makeStore();
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => allocateV3MarketId(store, predictionKey))
    );
    expect(new Set(ids).size).toBe(20);
  });

  it('steps over a number that already has a record', async () => {
    // Any environment where markets were written before the counter existed.
    const store = makeStore({
      [predictionKey('pred_v3_1')]: '{}',
      [predictionKey('pred_v3_2')]: '{}',
    });
    expect(await allocateV3MarketId(store, predictionKey)).toBe(3);
  });

  it('throws rather than returning a colliding number', async () => {
    // Every candidate taken. Refusing is correct: a caller that gets an error
    // writes nothing, a caller handed a taken number overwrites a live market.
    const taken: Record<string, unknown> = {};
    for (let i = 1; i <= 200; i++) taken[predictionKey(`pred_v3_${i}`)] = '{}';
    const store = makeStore(taken);

    await expect(allocateV3MarketId(store, predictionKey)).rejects.toBeInstanceOf(
      MarketIdUnavailableError
    );
  });

  it('does not confuse an existing record with an empty one', async () => {
    // A record stored as an empty string is still a record. Treating a falsy
    // value as absent would hand out its id again.
    const store = makeStore({ [predictionKey('pred_v3_1')]: '' });
    expect(await allocateV3MarketId(store, predictionKey)).toBe(2);
  });
});

describe('seeding the counter', () => {
  it('raises it above existing records', async () => {
    const store = makeStore();
    await seedV3Counter(store, 41);
    expect(await allocateV3MarketId(store, predictionKey)).toBe(42);
  });

  it('never lowers it, because that hands out a number twice', async () => {
    const store = makeStore({ [V3_ID_COUNTER]: 100 });
    const after = await seedV3Counter(store, 5);
    expect(after).toBe(100);
    expect(await allocateV3MarketId(store, predictionKey)).toBe(101);
  });
});
