import { describe, it, expect } from 'vitest';
import {
  allocateMarketId,
  seedMarketCounter,
  MarketIdUnavailableError,
  MARKET_ID_COUNTER,
  type AllocatorStore,
} from './marketAllocator';
import { canonicalMarketId, CURRENT_GENERATION } from './marketId';

const predictionKey = (id: string) => `prediction:${id}`;

/** The id this allocator would mint for `n`, so the tests follow the constant. */
const idFor = (n: number) => canonicalMarketId(CURRENT_GENERATION, n);

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

describe('allocating a market number', () => {
  it('starts at 1 and never repeats', async () => {
    const store = makeStore();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await allocateMarketId(store, predictionKey));
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives two callers racing for an id two different numbers', async () => {
    // The failure this exists to prevent: a read-then-write allocator hands the
    // same number to both, both records are written, the resolver registers one,
    // and bets from either card settle against the same on-chain market.
    const store = makeStore();
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => allocateMarketId(store, predictionKey))
    );
    expect(new Set(ids).size).toBe(20);
  });

  it('steps over a number that already has a record', async () => {
    // Any environment where markets were written before the counter existed.
    const store = makeStore({
      [predictionKey(idFor(1))]: '{}',
      [predictionKey(idFor(2))]: '{}',
    });
    expect(await allocateMarketId(store, predictionKey)).toBe(3);
  });

  it('throws rather than returning a colliding number', async () => {
    // Every candidate taken. Refusing is correct: a caller that gets an error
    // writes nothing, a caller handed a taken number overwrites a live market.
    const taken: Record<string, unknown> = {};
    for (let i = 1; i <= 200; i++) taken[predictionKey(idFor(i))] = '{}';
    const store = makeStore(taken);

    await expect(allocateMarketId(store, predictionKey)).rejects.toBeInstanceOf(
      MarketIdUnavailableError
    );
  });

  it('does not confuse an existing record with an empty one', async () => {
    // A record stored as an empty string is still a record. Treating a falsy
    // value as absent would hand out its id again.
    const store = makeStore({ [predictionKey(idFor(1))]: '' });
    expect(await allocateMarketId(store, predictionKey)).toBe(2);
  });
});

describe('the counter and the id prefix name the same generation', () => {
  // The bug this pins down: the counter said v3 and create_market.js said v4,
  // so two allocators handed out numbers into one on-chain id space. Neither
  // one saw the other's records, because each probed a prefix the other never
  // wrote. Checking the two names agree is what makes that impossible to
  // reintroduce by editing one of them.
  it('derives the counter key from the generation it mints', () => {
    expect(MARKET_ID_COUNTER).toBe(`market:${CURRENT_GENERATION}:next_id`);
  });

  it('probes the prefix it is about to write', async () => {
    // Seed a record under the id the allocator will produce for 1. If the probe
    // looked at a different generation's prefix it would not see this and would
    // return 1 anyway.
    const store = makeStore({ [predictionKey(idFor(1))]: '{}' });
    expect(await allocateMarketId(store, predictionKey)).toBe(2);
    expect(idFor(1)).toContain(CURRENT_GENERATION);
  });

  it('matches the counter scripts/create_market.js hardcodes', () => {
    // That script cannot import this file, so it writes the string out. If this
    // assertion fails, the script is allocating from a different counter again.
    expect(MARKET_ID_COUNTER).toBe('market:v4:next_id');
  });
});

describe('seeding the counter', () => {
  it('raises it above existing records', async () => {
    const store = makeStore();
    await seedMarketCounter(store, 41);
    expect(await allocateMarketId(store, predictionKey)).toBe(42);
  });

  it('never lowers it, because that hands out a number twice', async () => {
    const store = makeStore({ [MARKET_ID_COUNTER]: 100 });
    const after = await seedMarketCounter(store, 5);
    expect(after).toBe(100);
    expect(await allocateMarketId(store, predictionKey)).toBe(101);
  });
});
