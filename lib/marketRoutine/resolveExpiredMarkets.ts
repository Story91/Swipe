/**
 * Settle every routine market whose deadline has passed, one observation per
 * market, proof written before the mirror flips.
 *
 * The chain is checked before anything is sent. A market that reads resolved
 * on chain but pending in Redis is a previous run that died between the
 * transaction and the Redis write, so the mirror is backfilled and nothing is
 * sent again. That ordering is the whole idempotency story: the chain is the
 * source of truth, Redis only ever catches up to it.
 */

import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction, ResolutionSpec } from '@/lib/types/redis';
import { marketNumber } from '@/lib/marketId';
import { evaluateOutcome, type PriceObservation } from './priceProof';
import type { RoutineChainWriter } from './chainWriter';

/** Hourly runs, so 24 failures is a day of the source being unreadable. */
export const FLAG_AFTER_FAILURES = 24;

export interface ResolveDeps {
  listPending(chain: ChainKey): Promise<string[]>;
  getRecord(id: string, chain: ChainKey): Promise<RedisPrediction | null>;
  saveRecord(record: RedisPrediction, chain: ChainKey): Promise<void>;
  removePending(chain: ChainKey, id: string): Promise<void>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  fetchObservation(spec: ResolutionSpec, nowUnix: number): Promise<PriceObservation>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}

export interface ResolvedEntry {
  id: string;
  outcome: boolean;
  observedPrice: number;
  threshold: number;
  tx: string | null;
}

export interface ResolveResult {
  chain: ChainKey;
  dryRun: boolean;
  resolved: ResolvedEntry[];
  backfilled: string[];
  fetchFailed: string[];
  flagged: string[];
  notDue: string[];
}

export async function resolveExpiredMarkets(
  deps: ResolveDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<ResolveResult> {
  const { chainKey, dryRun } = opts;
  const now = deps.now();
  const result: ResolveResult = {
    chain: chainKey,
    dryRun,
    resolved: [],
    backfilled: [],
    fetchFailed: [],
    flagged: [],
    notDue: [],
  };

  const pending = await deps.listPending(chainKey);
  if (pending.length === 0) return result;

  const writer = deps.writer(chainKey);
  let changed = false;

  for (const id of pending) {
    const record = await deps.getRecord(id, chainKey);

    // A record that is gone or already settled has no business in the set.
    if (!record || record.resolved || record.cancelled) {
      if (!dryRun) await deps.removePending(chainKey, id);
      continue;
    }
    if (record.deadline > now) {
      result.notDue.push(id);
      continue;
    }
    const spec = record.resolutionSpec;
    const numericId = marketNumber(id);
    if (!spec || numericId === null) {
      // Not this routine's market to settle; flag it for a human.
      result.flagged.push(id);
      continue;
    }

    const onChain = await writer.readPrediction(numericId);

    if (onChain.resolved) {
      if (!dryRun) {
        record.resolved = true;
        record.outcome = onChain.outcome;
        record.resolutionProof = {
          source: 'chain',
          sourceUrl: null,
          observedPrice: null,
          threshold: spec.threshold,
          comparator: 'above',
          outcome: onChain.outcome,
          fetchedAt: now,
          deadline: record.deadline,
          resolvedTx: null,
          note:
            'Backfilled from on-chain state. The resolution transaction landed ' +
            'in an earlier run that failed before writing Redis.',
        };
        await deps.saveRecord(record, chainKey);
        await deps.removePending(chainKey, id);
        changed = true;
      }
      result.backfilled.push(id);
      continue;
    }
    if (onChain.cancelled) {
      if (!dryRun) {
        record.cancelled = true;
        await deps.saveRecord(record, chainKey);
        await deps.removePending(chainKey, id);
        changed = true;
      }
      continue;
    }
    if (onChain.refundable) {
      // enableRefundsAfterGrace is callable by anyone once a market has sat
      // unsettled for 30 days past its deadline, and it sets refundable
      // without setting cancelled. resolvePrediction reverts on a refundable
      // market, so this is not an outcome to send, it is a stuck market for a
      // human to look at. Drop it from the pending set so the routine stops
      // retrying it forever.
      if (!dryRun) {
        await deps.removePending(chainKey, id);
      }
      result.flagged.push(id);
      continue;
    }

    let observation: PriceObservation;
    try {
      observation = await deps.fetchObservation(spec, now);
    } catch {
      const failures = (record.resolveFailures ?? 0) + 1;
      if (!dryRun) {
        record.resolveFailures = failures;
        await deps.saveRecord(record, chainKey);
      }
      result.fetchFailed.push(id);
      if (failures >= FLAG_AFTER_FAILURES) result.flagged.push(id);
      continue;
    }

    const outcome = evaluateOutcome(spec, observation);

    if (dryRun) {
      result.resolved.push({
        id,
        outcome,
        observedPrice: observation.price,
        threshold: spec.threshold,
        tx: null,
      });
      continue;
    }

    const tx = await writer.resolvePrediction(numericId, outcome);

    record.resolved = true;
    record.outcome = outcome;
    record.resolveFailures = 0;
    record.resolutionProof = {
      source: spec.source,
      sourceUrl: observation.sourceUrl,
      observedPrice: observation.price,
      threshold: spec.threshold,
      comparator: 'above',
      outcome,
      fetchedAt: observation.fetchedAt,
      deadline: record.deadline,
      resolvedTx: tx,
      raw: observation.raw,
    };
    await deps.saveRecord(record, chainKey);
    await deps.removePending(chainKey, id);
    changed = true;

    result.resolved.push({
      id,
      outcome,
      observedPrice: observation.price,
      threshold: spec.threshold,
      tx,
    });
  }

  if (changed) deps.invalidateListing(chainKey);
  return result;
}
