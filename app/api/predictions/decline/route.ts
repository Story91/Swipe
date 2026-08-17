import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS, redisHelpers } from '@/lib/redis';
import { chainFromRequestOrBody } from '@/lib/chains/requestChain';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createChainPublicClient } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { parseMarketId, CURRENT_GENERATION } from '@/lib/marketId';

/**
 * Turn down a market proposal.
 *
 * Anyone with a wallet can propose, which is the point of the product, so spam
 * is a matter of time. Until now there was no way to say no: nothing in the
 * codebase cleared `needsApproval`, and the only exit for a bad proposal was to
 * register it on chain and then cancel it, which is two transactions and real
 * gas to dispose of something that had never left Redis.
 *
 * A proposal is inert. It has no pool, no positions and no contract behind it,
 * so declining is a Redis delete and the record is removed rather than parked.
 * The market number it was holding is simply burned; the counter only ever goes
 * up, so nothing is reused and no later market inherits its id.
 *
 * WHY THIS IS NOT `savePrediction` WITH A FLAG
 *
 * savePrediction routes a record into exactly one status set from its own
 * fields. Clearing needsApproval on an unresolved record with a future deadline
 * files it under PREDICTIONS_ACTIVE, which would put a declined proposal into
 * the live feed as a bettable market. The one thing this endpoint must never do.
 */

const DECLINED_LOG = (id: string) => `proposal:declined:${id}`;

function bad(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, 'decline');
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('Body must be JSON');
  }

  const { predictionId, reason } = (body ?? {}) as { predictionId?: string; reason?: string };
  if (!predictionId || typeof predictionId !== 'string') {
    return bad('predictionId is required');
  }

  const requested = chainFromRequestOrBody(request, body);
  if (!requested.ok) return bad(requested.error);
  const chain = requested.chain;

  const record = await redisHelpers.getPrediction(predictionId, chain);
  if (!record) return bad('No such proposal on this chain', 404);

  /**
   * Only ever a proposal, never a market.
   *
   * Three guards, and the third is the one that matters. A record can look
   * pending in Redis and already be registered on chain: the sync writes the
   * pools but nothing clears needsApproval, so the flag outlives the fact.
   * Deleting such a record would leave a live market holding real money with
   * nothing in Redis to render it, and no way to find it again from the app.
   */
  if (!record.needsApproval || record.approved) {
    return bad('That is not a proposal waiting for review');
  }

  const ref = parseMarketId(predictionId);
  if (!ref || ref.generation !== CURRENT_GENERATION) {
    return bad('Only proposals on the current contract generation can be declined');
  }

  const market = getMarketContract(chain);
  if (market) {
    try {
      const onChain = (await createChainPublicClient(chain).readContract({
        address: market.address,
        abi: market.abi as never,
        functionName: 'getPrediction',
        args: [BigInt(ref.numericId)],
      })) as readonly unknown[];

      if (Boolean(onChain[0])) {
        return bad(
          'That market is registered on chain, so it is a market and not a proposal. Cancel it on the contract instead.',
          409
        );
      }
    } catch (error) {
      // Could not ask the chain. Refusing is the only safe answer: the check
      // exists to stop a live market being deleted, and skipping it because the
      // node was slow defeats the point.
      console.error('[decline] could not check the chain:', error);
      return bad('Could not confirm this is unregistered right now. Try again shortly.', 503);
    }
  }

  await redisHelpers.deletePrediction(predictionId, chain);

  // A short note about who turned it down, so a creator asking why has an
  // answer and a second decline of the same id is visible. Kept small and out
  // of the prediction keyspace so nothing listing markets picks it up.
  await redis.set(
    DECLINED_LOG(predictionId),
    JSON.stringify({
      id: predictionId,
      chain,
      question: record.question,
      creator: record.creator,
      declinedBy: auth.address,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : '',
      at: Math.floor(Date.now() / 1000),
    })
  );

  return NextResponse.json({ success: true, id: predictionId, chain });
}
