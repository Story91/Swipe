/**
 * One weekly batch for one chain: pick tokens, give each a threshold and a
 * weekend deadline, register on chain, publish to Redis.
 *
 * Order per market is allocate, chain, Redis, the same reasoning as
 * scripts/create_market.js: a failed chain call burns a number and publishes
 * nothing, where the other order leaves a registered market the app cannot
 * see.
 */

import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction } from '@/lib/types/redis';
import { canonicalMarketId, CURRENT_GENERATION } from '@/lib/marketId';
import { buildQuestion, pickThreshold, weekendDeadlines } from './planning';
import type { SelectedToken } from './tokenSelection';
import type { RoutineChainWriter } from './chainWriter';

/** rules-v3.md 5.2. Counted per chain, batch is trimmed to fit. */
const MAX_OPEN_MARKETS = 12;

export interface CreateDeps {
  selectTokens(chainKey: ChainKey): Promise<SelectedToken[]>;
  /** Atomically claims this chain's weekly batch, keyed by the batch's own
   *  Friday deadline. Returns true if this call newly claimed it (proceed),
   *  false if it was already claimed (skip, someone/something already ran
   *  or is running this week's batch on this chain). */
  claimWeeklyBatch(chainKey: ChainKey, weekKey: string): Promise<boolean>;
  allocateId(chainKey: ChainKey): Promise<number>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  savePrediction(record: RedisPrediction, chain: ChainKey): Promise<void>;
  addPending(chain: ChainKey, id: string): Promise<void>;
  countOpenMarkets(chain: ChainKey): Promise<number>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}

export interface PlannedMarket {
  symbol: string;
  question: string;
  threshold: number;
  deadline: number;
  chartUrl: string;
  poolAddress: string;
}

export interface CreateResult {
  chain: ChainKey;
  dryRun: boolean;
  planned: PlannedMarket[];
  created: string[];
  trimmed: number;
  /** True when this week's batch on this chain was already claimed by an
   *  earlier run (a retried cron invocation, a second admin click), and this
   *  call skipped without allocating or registering anything. */
  alreadyBatched: boolean;
}

export async function createWeeklyMarkets(
  deps: CreateDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<CreateResult> {
  const { chainKey, dryRun } = opts;
  const now = deps.now();

  const tokens = await deps.selectTokens(chainKey);
  const deadlines = weekendDeadlines(now);

  const open = await deps.countOpenMarkets(chainKey);
  const allowed = Math.max(0, MAX_OPEN_MARKETS - open);
  const batch = tokens.slice(0, Math.min(tokens.length, deadlines.length, allowed));
  const trimmed = Math.min(tokens.length, deadlines.length) - batch.length;

  const planned: PlannedMarket[] = batch.map((token, i) => {
    const threshold = pickThreshold(token.priceUsd, token.change24hPct, i);
    return {
      symbol: token.symbol,
      question: buildQuestion(token.symbol, threshold),
      threshold,
      deadline: deadlines[i],
      chartUrl: token.chartUrl,
      poolAddress: token.poolAddress,
    };
  });

  const result: CreateResult = {
    chain: chainKey,
    dryRun,
    planned,
    created: [],
    trimmed,
    alreadyBatched: false,
  };
  if (dryRun) return result;

  // Claim before allocating or registering anything, so a retried cron
  // invocation or a second admin click is a no-op instead of a duplicate
  // batch. A dry run never reaches here, and never claims: it's a preview.
  const weekKey = String(deadlines[0]);
  const claimed = await deps.claimWeeklyBatch(chainKey, weekKey);
  if (!claimed) return { ...result, alreadyBatched: true };

  const writer = deps.writer(chainKey);

  for (let i = 0; i < planned.length; i++) {
    const plan = planned[i];
    const token = batch[i];

    const numericId = await deps.allocateId(chainKey);
    const id = canonicalMarketId(CURRENT_GENERATION, numericId);

    await writer.registerPrediction(numericId, writer.address, plan.deadline);

    const endsAt = new Date(plan.deadline * 1000);
    const record: RedisPrediction = {
      id,
      question: plan.question,
      description: '',
      category: 'Crypto',
      imageUrl: plan.chartUrl,
      includeChart: true,
      selectedCrypto: plan.symbol,
      endDate: endsAt.toISOString().slice(0, 10),
      endTime: endsAt.toISOString().slice(11, 16),
      deadline: plan.deadline,
      yesTotalAmount: 0,
      noTotalAmount: 0,
      swipeYesTotalAmount: 0,
      swipeNoTotalAmount: 0,
      usdcPoolEnabled: true,
      usdcYesTotalAmount: 0,
      usdcNoTotalAmount: 0,
      resolved: false,
      cancelled: false,
      createdAt: deps.now(),
      creator: writer.address,
      verified: true,
      approved: true,
      needsApproval: false,
      participants: [],
      totalStakes: 0,
      contractVersion: 'V4',
      createdByRoutine: true,
      resolutionSpec: {
        source: token.source,
        network: token.network,
        poolAddress: token.poolAddress,
        comparator: 'above',
        threshold: plan.threshold,
        template: 'price_at_close',
      },
    };

    await deps.savePrediction(record, chainKey);
    await deps.addPending(chainKey, id);
    result.created.push(id);
  }

  if (result.created.length > 0) deps.invalidateListing(chainKey);
  return result;
}
