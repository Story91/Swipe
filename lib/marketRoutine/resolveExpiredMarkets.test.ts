import { describe, it, expect, vi } from 'vitest';
import {
  resolveExpiredMarkets,
  FLAG_AFTER_FAILURES,
  type ResolveDeps,
} from './resolveExpiredMarkets';
import type { RedisPrediction } from '@/lib/types/redis';

const NOW = 1787346000; // an hour past the Friday 20:00 deadline

function routineRecord(over: Partial<RedisPrediction> = {}): RedisPrediction {
  return {
    id: 'pred_v4_100',
    question: 'Will AAA be above $11 when this market closes?',
    description: '',
    category: 'Crypto',
    imageUrl: 'https://chart/AAA',
    includeChart: true,
    selectedCrypto: 'AAA',
    endDate: '2026-08-21',
    endTime: '20:00',
    deadline: 1787342400,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: NOW - 300000,
    creator: '0xregistrar',
    verified: true,
    approved: true,
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    contractVersion: 'V4',
    createdByRoutine: true,
    resolutionSpec: {
      source: 'geckoterminal',
      network: 'base',
      poolAddress: '0xpoolAAA',
      comparator: 'above',
      threshold: 11,
      template: 'price_at_close',
    },
    ...over,
  };
}

function makeDeps(record: RedisPrediction, over: Partial<ResolveDeps> = {}) {
  const saves: RedisPrediction[] = [];
  const removed: string[] = [];
  const resolveTx = vi.fn(async () => '0xresolvetx');
  const deps: ResolveDeps = {
    listPending: async () => [record.id],
    getRecord: async () => record,
    saveRecord: async (r) => { saves.push(structuredClone(r)); },
    removePending: async (_c, id) => { removed.push(id); },
    writer: () => ({
      address: '0xregistrar',
      readPrediction: async () => ({
        registered: true, creator: '0xregistrar', deadline: record.deadline,
        resolved: false, cancelled: false, outcome: false, refundable: false,
      }),
      registerPrediction: vi.fn(),
      resolvePrediction: resolveTx,
    }),
    fetchObservation: async (spec) => ({
      price: 12.5, sourceUrl: `https://proof/${spec.poolAddress}`, fetchedAt: NOW, raw: {},
    }),
    invalidateListing: () => {},
    now: () => NOW,
    ...over,
  };
  return { deps, saves, removed, resolveTx };
}

describe('resolveExpiredMarkets', () => {
  it('resolves an expired market and stores the proof before the mirror flip', async () => {
    const record = routineRecord();
    const { deps, saves, removed, resolveTx } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.resolved).toEqual([
      { id: 'pred_v4_100', outcome: true, observedPrice: 12.5, threshold: 11, tx: '0xresolvetx' },
    ]);
    expect(resolveTx).toHaveBeenCalledWith(100, true);
    const saved = saves[0];
    expect(saved.resolved).toBe(true);
    expect(saved.outcome).toBe(true);
    expect(saved.resolutionProof).toMatchObject({
      source: 'geckoterminal',
      observedPrice: 12.5,
      threshold: 11,
      outcome: true,
      resolvedTx: '0xresolvetx',
      deadline: 1787342400,
    });
    expect(removed).toEqual(['pred_v4_100']);
  });

  it('dry run reports outcomes without sending or saving', async () => {
    const record = routineRecord();
    const { deps, saves, resolveTx } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.resolved[0]).toMatchObject({ id: 'pred_v4_100', outcome: true, tx: null });
    expect(resolveTx).not.toHaveBeenCalled();
    expect(saves).toEqual([]);
  });

  it('backfills when the chain already resolved, never sends twice', async () => {
    const record = routineRecord();
    const { deps, saves, removed, resolveTx } = makeDeps(record, {
      writer: () => ({
        address: '0xregistrar',
        readPrediction: async () => ({
          registered: true, creator: '0xregistrar', deadline: record.deadline,
          resolved: true, cancelled: false, outcome: false, refundable: false,
        }),
        registerPrediction: vi.fn(),
        resolvePrediction: resolveTxNeverCalled,
      }),
    });
    function resolveTxNeverCalled(): never { throw new Error('must not send'); }
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.backfilled).toEqual(['pred_v4_100']);
    expect(resolveTx).not.toHaveBeenCalled();
    expect(saves[0].resolved).toBe(true);
    expect(saves[0].outcome).toBe(false);
    expect(saves[0].resolutionProof?.source).toBe('chain');
    expect(removed).toEqual(['pred_v4_100']);
  });

  it('a failed fetch leaves the market pending and counts the failure', async () => {
    const record = routineRecord();
    const { deps, saves, removed } = makeDeps(record, {
      fetchObservation: async () => { throw new Error('api down'); },
    });
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.fetchFailed).toEqual(['pred_v4_100']);
    expect(result.flagged).toEqual([]);
    expect(saves[0].resolveFailures).toBe(1);
    expect(saves[0].resolved).toBe(false);
    expect(removed).toEqual([]);
  });

  it('flags after 24 consecutive failures', async () => {
    const record = routineRecord({ resolveFailures: FLAG_AFTER_FAILURES - 1 });
    const { deps } = makeDeps(record, {
      fetchObservation: async () => { throw new Error('api down'); },
    });
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.flagged).toEqual(['pred_v4_100']);
  });

  it('skips markets whose deadline has not passed', async () => {
    const record = routineRecord({ deadline: NOW + 3600 });
    const { deps, saves } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.notDue).toEqual(['pred_v4_100']);
    expect(result.resolved).toEqual([]);
    expect(saves).toEqual([]);
  });

  it('drops already-settled records from the pending set', async () => {
    const record = routineRecord({ resolved: true, outcome: true });
    const { deps, removed } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.resolved).toEqual([]);
    expect(removed).toEqual(['pred_v4_100']);
  });
});
