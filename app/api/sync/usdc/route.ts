import { NextRequest, NextResponse } from 'next/server';
import type { PublicClient } from 'viem';
import { createChainPublicClient, getChainConfig } from '@/lib/chains';
import { chainFromRequest, chainFromRequestOrBody } from '@/lib/chains/requestChain';
import type { ChainKey } from '@/lib/chains/types';
import { getMarketContract } from '@/lib/chains/market';
import { parseMarketId, CURRENT_GENERATION, type MarketRef } from '@/lib/marketId';
import { redis, REDIS_KEYS } from '@/lib/redis';

/**
 * Pulls a market's pools and positions off chain into Redis.
 *
 * Two contract generations are readable at once and they are not
 * interchangeable. Markets minted before V3 sit in the archived Base USDC pool,
 * which still holds real positions people need to see. Markets minted by the
 * current generation sit in the live contract. Each id says which one it belongs
 * to, so each id is routed rather than assumed.
 *
 * Three things this used to get wrong, all silently:
 *
 *  - It hardcoded the archived pool's address, so a V3 market would have been
 *    read from a contract that has never heard of it and written back as
 *    "not registered".
 *  - Its local getPosition ABI declared slot 3 as `exitedEarly: bool`. The
 *    archived pool actually returns `noEntryPrice: uint256` there. Any non-zero
 *    NO entry price is truthy, so every such position was stored as having
 *    exited early.
 *  - It rebuilt every Redis id as `pred_v2_${n}` regardless of the id it was
 *    given.
 */

/** The archived Base USDC pool. Read-only history, and its own ABI shape. */
const ARCHIVED_POOL_ABI = [
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getPrediction',
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'creator', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'yesPool', type: 'uint256' },
      { name: 'noPool', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'cancelled', type: 'bool' },
      { name: 'outcome', type: 'bool' },
      { name: 'participantCount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    name: 'getPosition',
    outputs: [
      { name: 'yesAmount', type: 'uint256' },
      { name: 'noAmount', type: 'uint256' },
      // Two entry prices, not a price and a flag. Getting this wrong is what
      // wrote exitedEarly: true onto every position with a NO entry price.
      { name: 'yesEntryPrice', type: 'uint256' },
      { name: 'noEntryPrice', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getParticipants',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * The chain now comes from the request, and it decides both halves at once:
 * which contract the pools are read from and which Redis keyspace they are
 * written into. The two must be the same chain. A module-scope client pinned to
 * one chain, which is what stood here, would read Base's V3 pools and write them
 * over Robinhood's records the moment a Robinhood market existed.
 *
 * Both are still Base for every market that exists today, and absent means Base,
 * so nothing about the current sync changes.
 */
interface SyncResult {
  success: boolean;
  registered: boolean;
  yesPool?: number;
  noPool?: number;
  participantCount?: number;
  error?: string;
}

/**
 * Where a given market's data lives, and how to read it.
 *
 * This used to test `generation === 'v3'`, which meant "the live contract" on
 * the day it was written and stopped meaning that the moment the config moved to
 * V4. A v4 id then fell past it into the archived branch and had Base's dead
 * USDC pool read into its record. The test is now against CURRENT_GENERATION, so
 * it follows the config instead of naming a generation that was current once.
 */
function resolveSource(ref: MarketRef, chain: ChainKey) {
  if (ref.generation === CURRENT_GENERATION) {
    const market = getMarketContract(chain);
    if (!market) return null;
    return {
      kind: 'live' as const,
      address: market.address,
      abi: market.abi,
      contractVersion: 'V4' as const,
    };
  }

  // V3 sits between the two branches and belongs to neither. Its four markets
  // are registered on a contract this app no longer carries an address for, and
  // they are all empty, so there is nothing to read and nothing to lose. Falling
  // through to the archived pool would read a different contract's market number
  // and write those pools onto a V3 record, which is worse than saying no.
  if (ref.generation === 'v3') return null;

  // Only Base has an archived pool. On any other chain this returns null and
  // the caller reports "no contract for this market", which is the truth: a
  // pred_v2_* id does not name anything on a chain that never ran V2.
  const archived = getChainConfig(chain).contracts.dualPool;
  if (!archived) return null;
  return {
    kind: 'archived' as const,
    address: archived,
    abi: ARCHIVED_POOL_ABI,
    contractVersion: 'V2' as const,
  };
}

async function syncMarket(ref: MarketRef, chain: ChainKey, client: PublicClient): Promise<SyncResult> {
  const source = resolveSource(ref, chain);
  if (!source) {
    return { success: false, registered: false, error: 'No contract for this market' };
  }

  const id = BigInt(ref.numericId);

  try {
    // The live contract's getPrediction returns ten values and inserts
    // `refundable` before participantCount; the archived pool returns nine.
    // Reading one shape with the other's indexes silently swaps a bool for a
    // count.
    const data = (await client.readContract({
      address: source.address,
      abi: source.abi as never,
      functionName: 'getPrediction',
      args: [id],
    })) as readonly unknown[];

    const registered = Boolean(data[0]);
    if (!registered) return { success: true, registered: false };

    const yesPool = Number(data[3] as bigint);
    const noPool = Number(data[4] as bigint);
    const resolved = Boolean(data[5]);
    const cancelled = Boolean(data[6]);
    const outcome = Boolean(data[7]);
    const refundable = source.kind === 'live' ? Boolean(data[8]) : false;
    const participantCount = Number((source.kind === 'live' ? data[9] : data[8]) as bigint);

    const predData = await redis.get(REDIS_KEYS.PREDICTION(ref.redisId, chain));
    if (!predData) return { success: false, registered: true, error: 'No Redis record' };

    const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;

    const updated: Record<string, unknown> = {
      ...pred,
      usdcPoolEnabled: true,
      usdcYesTotalAmount: yesPool, // raw, 6 decimals
      usdcNoTotalAmount: noPool,
      usdcResolved: resolved,
      usdcCancelled: cancelled,
      usdcOutcome: outcome,
      usdcRefundable: refundable,
      usdcParticipantCount: participantCount,
      contractVersion: source.contractVersion,
    };

    if (participantCount > 0) {
      const participants = (await client
        .readContract({
          address: source.address,
          abi: source.abi as never,
          functionName: 'getParticipants',
          args: [id],
        })
        .catch(() => null)) as string[] | null;

      if (participants && participants.length > 0) {
        updated.usdcParticipants = participants.map((p) => p.toLowerCase());

        // Capped to avoid a request timeout. The cap is reported rather than
        // silent, so a market that outgrows it does not look fully synced.
        const CAP = 100;
        const toSync = participants.slice(0, CAP);
        if (participants.length > CAP) {
          console.warn(
            `[sync] ${ref.redisId}: ${participants.length} participants, syncing first ${CAP}`
          );
        }

        for (const participant of toSync) {
          try {
            const who = participant.toLowerCase() as `0x${string}`;

            // The two contracts disagree here in a way that compiles either
            // way: both return five values of the same types, but V3's slots 2
            // and 3 are weights where the archived pool's are entry prices.
            const position = (await client
              .readContract({
                address: source.address,
                abi: source.abi as never,
                functionName: source.kind === 'live' ? 'positions' : 'getPosition',
                args: [id, who],
              })
              .catch(() => null)) as readonly unknown[] | null;

            if (!position) continue;

            const yesAmount = Number(position[0] as bigint) || 0;
            const noAmount = Number(position[1] as bigint) || 0;
            if (yesAmount === 0 && noAmount === 0) continue;

            const stakeKey = REDIS_KEYS.USER_STAKES(who, ref.redisId, chain);
            const existing = await redis.get(stakeKey);
            const userStake = existing
              ? typeof existing === 'string'
                ? JSON.parse(existing)
                : existing
              : {
                  user: who,
                  predictionId: ref.redisId,
                  stakedAt: Math.floor(Date.now() / 1000),
                  contractVersion: source.contractVersion,
                };

            userStake.contractVersion = source.contractVersion;
            userStake.USDC = {
              yesAmount,
              noAmount,
              claimed: Boolean(position[4]),
              tokenType: 'USDC' as const,
              ...(source.kind === 'live'
                ? {
                    weightedYes: Number(position[2] as bigint) || 0,
                    weightedNo: Number(position[3] as bigint) || 0,
                  }
                : {
                    entryPrice: Number(position[2] as bigint) || 0,
                    noEntryPrice: Number(position[3] as bigint) || 0,
                  }),
            };

            await redis.set(stakeKey, JSON.stringify(userStake));
          } catch (positionError) {
            console.warn(`[sync] position failed for ${participant} in ${ref.redisId}:`, positionError);
          }
        }
      }
    }

    await redis.set(REDIS_KEYS.PREDICTION(ref.redisId, chain), JSON.stringify(updated));

    return {
      success: true,
      registered: true,
      yesPool: yesPool / 1e6,
      noPool: noPool / 1e6,
      participantCount,
    };
  } catch (error) {
    console.error(`[sync] ${ref.redisId} failed:`, error);
    return { success: false, registered: false, error: 'Read failed' };
  }
}

/**
 * POST { predictionIds: string[] | number[] }
 *
 * Ids may be Redis ids or bare numbers. A bare number has no generation, so it
 * is read as a v2 market, which is what every existing caller means by it.
 * Results are keyed by the numeric id, matching what callers already index by.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionIds } = body ?? {};

    if (!Array.isArray(predictionIds)) {
      return NextResponse.json(
        { success: false, error: 'predictionIds array required' },
        { status: 400 }
      );
    }

    const requested = chainFromRequestOrBody(request, body);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;
    const client = createChainPublicClient(chain);

    const results: Record<number, SyncResult> = {};
    const skipped: unknown[] = [];

    for (const raw of predictionIds) {
      const ref =
        typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0
          ? parseMarketId(`pred_v2_${raw}`)
          : parseMarketId(raw);

      if (!ref) {
        skipped.push(raw);
        continue;
      }
      results[ref.numericId] = await syncMarket(ref, chain, client);
    }

    return NextResponse.json({
      success: true,
      chain,
      synced: Object.keys(results).length,
      // Reported rather than dropped: an id this route cannot read used to
      // vanish from the response and read as a successful no-op.
      skipped,
      results,
    });
  } catch (error) {
    console.error('[sync] request failed:', error);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}

/**
 * GET ?ids=pred_v3_1,pred_v2_224
 *
 * Manual sync. There is no default list any more: the previous one hardcoded
 * three market numbers from a single incident, which made a bare GET look like
 * a full resync while touching three markets.
 */
export async function GET(request: NextRequest) {
  try {
    const idsParam = new URL(request.url).searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json(
        { success: false, error: 'ids query parameter required, comma separated' },
        { status: 400 }
      );
    }

    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;
    const client = createChainPublicClient(chain);

    const results: Record<string, SyncResult> = {};
    const skipped: string[] = [];
    let syncedCount = 0;

    for (const part of idsParam.split(',').map((s) => s.trim()).filter(Boolean)) {
      const ref = /^\d+$/.test(part) ? parseMarketId(`pred_v2_${part}`) : parseMarketId(part);
      if (!ref) {
        skipped.push(part);
        continue;
      }
      const result = await syncMarket(ref, chain, client);
      results[ref.redisId] = result;
      if (result.success && result.registered) syncedCount++;
    }

    return NextResponse.json({
      success: true,
      chain,
      message: `Synced ${syncedCount} markets`,
      synced: syncedCount,
      skipped,
      results,
    });
  } catch (error) {
    console.error('[sync] bulk failed:', error);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
