/**
 * The production wiring: orchestrators get real Redis, real selection, and
 * the registrar-key chain writer. Everything above this file is pure and
 * tested; this file is deliberately nothing but glue.
 */

import { redis, REDIS_KEYS, redisHelpers, invalidatePredictionsCache } from '@/lib/redis';
import { allocateMarketId } from '@/lib/marketAllocator';
import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction, ResolutionSpec } from '@/lib/types/redis';
import { makeChainWriter } from './chainWriter';
import { selectBaseTokens, selectRobinhoodTokens, type JsonFetch } from './tokenSelection';
import { fetchObservation } from './priceProof';
import type { CreateDeps } from './createWeeklyMarkets';
import type { ResolveDeps } from './resolveExpiredMarkets';

const fetchJson: JsonFetch = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

const nowUnix = () => Math.floor(Date.now() / 1000);

export function realCreateDeps(): CreateDeps {
  return {
    selectTokens: (chainKey) =>
      chainKey === 'robinhood'
        ? selectRobinhoodTokens(fetchJson)
        : selectBaseTokens(fetchJson),
    allocateId: (chainKey) =>
      allocateMarketId(redis, (id) => REDIS_KEYS.PREDICTION(id, chainKey)),
    writer: makeChainWriter,
    savePrediction: (record: RedisPrediction, chain: ChainKey) =>
      redisHelpers.savePrediction(record, chain),
    addPending: async (chain, id) => {
      await redis.sadd(REDIS_KEYS.ROUTINE_PENDING(chain), id);
    },
    countOpenMarkets: async (chain) =>
      (await redisHelpers.getActivePredictions(chain)).length,
    invalidateListing: invalidatePredictionsCache,
    now: nowUnix,
  };
}

export function realResolveDeps(): ResolveDeps {
  return {
    listPending: async (chain) =>
      (await redis.smembers(REDIS_KEYS.ROUTINE_PENDING(chain))) as string[],
    getRecord: (id, chain) => redisHelpers.getPrediction(id, chain),
    saveRecord: (record, chain) => redisHelpers.savePrediction(record, chain),
    removePending: async (chain, id) => {
      await redis.srem(REDIS_KEYS.ROUTINE_PENDING(chain), id);
    },
    writer: makeChainWriter,
    fetchObservation: (spec: ResolutionSpec, now: number) =>
      fetchObservation(spec, fetchJson, now),
    invalidateListing: invalidatePredictionsCache,
    now: nowUnix,
  };
}
