import { describe, it, expect, vi } from 'vitest';
import { createWeeklyMarkets, type CreateDeps } from './createWeeklyMarkets';
import type { SelectedToken } from './tokenSelection';
import type { RedisPrediction } from '@/lib/types/redis';

// Wednesday 2026-08-19 12:07 UTC, same fixture as planning.test.ts.
const NOW = Date.UTC(2026, 7, 19, 12, 7, 0) / 1000;

function token(symbol: string, priceUsd: number): SelectedToken {
  return {
    symbol,
    poolAddress: `0xpool${symbol}`,
    network: 'base',
    source: 'geckoterminal',
    priceUsd,
    change24hPct: 5,
    chartUrl: `https://chart/${symbol}`,
  };
}

function makeDeps(over: Partial<CreateDeps> = {}) {
  const saved: RedisPrediction[] = [];
  const pending: string[] = [];
  let nextId = 100;
  const deps: CreateDeps = {
    selectTokens: async () => [token('AAA', 10), token('BBB', 20), token('CCC', 30)],
    allocateId: async () => nextId++,
    writer: () => ({
      address: '0xregistrar',
      readPrediction: vi.fn(),
      registerPrediction: vi.fn(async () => '0xtxhash'),
      resolvePrediction: vi.fn(),
    }),
    savePrediction: async (r) => { saved.push(r); },
    addPending: async (_c, id) => { pending.push(id); },
    countOpenMarkets: async () => 0,
    invalidateListing: () => {},
    now: () => NOW,
    ...over,
  };
  return { deps, saved, pending };
}

describe('createWeeklyMarkets', () => {
  it('dry run plans but allocates nothing and writes nothing', async () => {
    const { deps, saved, pending } = makeDeps();
    const allocate = vi.fn();
    deps.allocateId = allocate as unknown as CreateDeps['allocateId'];
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.planned).toHaveLength(3);
    expect(result.created).toEqual([]);
    expect(allocate).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(pending).toEqual([]);
  });

  it('pairs tokens with the weekend grid in order', async () => {
    const { deps } = makeDeps();
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.planned.map((p) => p.deadline)).toEqual([
      1787342400, 1787428800, 1787443140,
    ]);
    // Index 0 threshold sits above the price, index 1 below.
    expect(result.planned[0].threshold).toBeGreaterThan(10);
    expect(result.planned[1].threshold).toBeLessThan(20);
  });

  it('creates records that carry their own resolution recipe', async () => {
    const { deps, saved, pending } = makeDeps();
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.created).toEqual(['pred_v4_100', 'pred_v4_101', 'pred_v4_102']);
    expect(pending).toEqual(result.created);
    const rec = saved[0];
    expect(rec).toMatchObject({
      id: 'pred_v4_100',
      category: 'Crypto',
      includeChart: true,
      selectedCrypto: 'AAA',
      imageUrl: 'https://chart/AAA',
      creator: '0xregistrar',
      needsApproval: false,
      contractVersion: 'V4',
      createdByRoutine: true,
    });
    expect(rec.resolutionSpec).toMatchObject({
      source: 'geckoterminal',
      network: 'base',
      poolAddress: '0xpoolAAA',
      comparator: 'above',
      template: 'price_at_close',
    });
    expect(rec.question).toContain('Will AAA be above $');
  });

  it('trims the batch to the 12-open cap', async () => {
    const { deps } = makeDeps({ countOpenMarkets: async () => 10 });
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.created).toHaveLength(2);
    expect(result.trimmed).toBe(1);
  });

  it('registers on chain before writing Redis', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      writer: () => ({
        address: '0xregistrar',
        readPrediction: vi.fn(),
        registerPrediction: async () => { order.push('chain'); return '0xtx'; },
        resolvePrediction: vi.fn(),
      }),
      savePrediction: async () => { order.push('redis'); },
    });
    await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(order.slice(0, 2)).toEqual(['chain', 'redis']);
  });
});
