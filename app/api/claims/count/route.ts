import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '../../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { stakeLegs, tokenMarket, legSides, COLLATERAL_LEG } from '@/lib/userStake';

/**
 * GET /api/claims/count?userId=0x...
 * Fast endpoint to count ready-to-claim predictions for a user
 * Optimized for badge display - doesn't load full prediction data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'User ID is required',
        },
        { status: 400 }
      );
    }

    const normalizedUserId = userId.toLowerCase();

    // The badge counts what is claimable on one chain. Absent ?chain= means
    // Base, so the badge keeps meaning exactly what it meant before.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    // Get all predictions at once (cached and index-backed)
    const allPredictions = await redisHelpers.getAllPredictions(chain);
    const predictionsMap = new Map(allPredictions.map(p => [p.id, p]));

    // Candidate stake keys come from the participants list each prediction
    // already carries, which is read from the contract during sync.
    //
    // This replaces a redis.keys('user_stakes:<user>:*') call. KEYS walks the
    // entire keyspace and blocks the server, and this endpoint is polled every
    // 30 seconds by every open tab — so the cost scaled with users online, not
    // with the work actually needed.
    //
    // The prediction id is carried alongside the key rather than parsed back
    // out of it. Splitting on ':' and taking everything after the second colon
    // only works while the key has no prefix; on a namespaced chain it would
    // hand back the user address as the market id and every lookup would miss.
    const stakeEntries = allPredictions
      .filter(p => (p.participants || []).some(a => a.toLowerCase() === normalizedUserId))
      .map(p => ({ key: REDIS_KEYS.USER_STAKES(normalizedUserId, p.id, chain), predictionId: p.id }));
    const stakeKeys = stakeEntries.map(e => e.key);

    if (stakeKeys.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        timestamp: new Date().toISOString()
      });
    }

    let readyToClaimCount = 0;
    const processedPredictions = new Set<string>();

    // Fetch stakes in batches, one round trip per batch rather than per key.
    const batchSize = 50;
    for (let i = 0; i < stakeEntries.length; i += batchSize) {
      const batch = stakeEntries.slice(i, i + batchSize);
      const batchValues = (await redis.mget(...batch.map(e => e.key))) as unknown[];
      const stakePromises = batch.map(async ({ key, predictionId }, batchIndex) => {
        try {
          const data = batchValues[batchIndex];
          if (!data) return null;

          const stake = typeof data === 'string' ? JSON.parse(data) : data;
          if (!stake || typeof stake !== 'object' || !('user' in stake)) {
            return null;
          }

          const prediction = predictionsMap.get(predictionId);

          if (!prediction) return null;

          if (processedPredictions.has(predictionId)) return null;

          // Which legs of this position are waiting to be collected.
          //
          // This was two hand-written blocks, one for ETH and one for SWIPE,
          // plus a third for the flat V1 shape. There was never a fourth, so a
          // won position in the chain's collateral did not raise the badge and
          // the user was never told there was money to collect. It is counted
          // per leg because settlement is per leg: the collateral contract is a
          // different contract and resolves on its own schedule.
          const claimable = stakeLegs(stake).filter((l) => {
            if (l.claimed) return false;
            const market = tokenMarket(prediction, l.tokenType);
            if (market.cancelled) return true;
            if (!market.resolved) return false;
            // Refundable means nobody was on the winning side, so everyone is
            // owed their stake back rather than nobody being owed anything.
            if (l.tokenType === COLLATERAL_LEG && prediction.usdcRefundable) return true;
            return (legSides(l).choice === 'YES') === market.outcome;
          });

          if (claimable.length > 0) {
            processedPredictions.add(predictionId);
            return predictionId;
          }
          
          return null;
        } catch (error) {
          console.error(`Failed to process stake ${key}:`, error);
          return null;
        }
      });

      const results = await Promise.all(stakePromises);
      readyToClaimCount += results.filter(Boolean).length;
    }

    // Also check USDC positions from Redis (they should be synced by sync/usdc endpoint)
    // Check all predictions with usdcPoolEnabled that we haven't processed yet
    // USDC can be resolved independently of the main prediction, so check separately
    const usdcPredictions = allPredictions.filter(p => {
      const predAny = p as any;
      // Check if USDC pool is enabled and resolved/cancelled
      const hasUsdcPool = predAny.usdcPoolEnabled || false;
      const usdcResolved = predAny.usdcResolved || false;
      const usdcCancelled = predAny.usdcCancelled || false;
      const isUsdcResolvedOrCancelled = (usdcResolved && !usdcCancelled) || usdcCancelled;
      
      return hasUsdcPool && isUsdcResolvedOrCancelled && !processedPredictions.has(p.id);
    });

    if (usdcPredictions.length > 0) {
      // Check USDC stakes from Redis
      for (const prediction of usdcPredictions) {
        const stakeKey = REDIS_KEYS.USER_STAKES(normalizedUserId, prediction.id, chain);
        const stakeData = await redis.get(stakeKey);
        const predAny = prediction as any;
        
        if (stakeData) {
          const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
          
          // Check if user has USDC stake
          if (stake.USDC && !stake.USDC.claimed) {
            const usdcYesAmount = Number(stake.USDC.yesAmount) || 0;
            const usdcNoAmount = Number(stake.USDC.noAmount) || 0;
            const hasStake = usdcYesAmount > 0 || usdcNoAmount > 0;

            if (hasStake) {
              const usdcResolved = predAny.usdcResolved || false;
              const usdcCancelled = predAny.usdcCancelled || false;
              const usdcOutcome = predAny.usdcOutcome ?? null;

              if (usdcCancelled) {
                // Can claim refund if cancelled
                processedPredictions.add(prediction.id);
                readyToClaimCount++;
              } else if (usdcResolved && usdcOutcome !== null) {
                // Check if user won
                const userWon = (usdcYesAmount > 0 && usdcOutcome === true) ||
                              (usdcNoAmount > 0 && usdcOutcome === false);
                if (userWon) {
                  processedPredictions.add(prediction.id);
                  readyToClaimCount++;
                }
              }
            }
          }
        } else {
          // No stake data in Redis - might need to sync USDC positions first
          // Try to check if user is in usdcParticipants list
          if (predAny.usdcParticipants && Array.isArray(predAny.usdcParticipants)) {
            const isParticipant = predAny.usdcParticipants.some((p: string) => 
              p.toLowerCase() === normalizedUserId
            );
            if (isParticipant) {
              // User is participant but stake not synced - this shouldn't happen but log it
              console.warn(`⚠️ User ${normalizedUserId} is in usdcParticipants for ${prediction.id} but stake not found in Redis`);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: readyToClaimCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to count ready-to-claim predictions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to count ready-to-claim predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

