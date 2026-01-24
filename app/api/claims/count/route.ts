import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '../../../../lib/redis';

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

    // Get all user stakes
    const userStakePattern = `user_stakes:${normalizedUserId}:*`;
    const stakeKeys = await redis.keys(userStakePattern);

    if (stakeKeys.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        timestamp: new Date().toISOString()
      });
    }

    // Get all predictions at once (faster than individual fetches)
    const allPredictions = await redisHelpers.getAllPredictions();
    const predictionsMap = new Map(allPredictions.map(p => [p.id, p]));

    let readyToClaimCount = 0;
    const processedPredictions = new Set<string>();

    // Fetch stakes in batches
    const batchSize = 50;
    for (let i = 0; i < stakeKeys.length; i += batchSize) {
      const batchKeys = stakeKeys.slice(i, i + batchSize);
      const stakePromises = batchKeys.map(async (key) => {
        try {
          const data = await redis.get(key);
          if (!data) return null;
          
          const stake = typeof data === 'string' ? JSON.parse(data) : data;
          if (!stake || typeof stake !== 'object' || !('user' in stake)) {
            return null;
          }

          // Extract prediction ID from key: user_stakes:userId:predictionId
          const predictionId = key.split(':').slice(2).join(':');
          const prediction = predictionsMap.get(predictionId);
          
          if (!prediction) return null;

          // Must be resolved OR cancelled
          const isResolvedOrCancelled = (prediction.resolved && !prediction.cancelled) || prediction.cancelled;
          if (!isResolvedOrCancelled || processedPredictions.has(predictionId)) {
            return null;
          }

          // Check if user can claim (same logic as EnhancedUserDashboard)
          const stakes = [];

          // Handle multi-token stake (V2)
          if (stake.ETH || stake.SWIPE) {
            if (stake.ETH && !stake.ETH.claimed) {
              const yesAmount = Number(stake.ETH.yesAmount) || 0;
              const noAmount = Number(stake.ETH.noAmount) || 0;
              const hasStake = yesAmount > 0 || noAmount > 0;

              if (hasStake) {
                if (prediction.cancelled) {
                  // For cancelled predictions, user can always claim refund
                  stakes.push('ETH');
                } else {
                  // For resolved predictions, check if user won
                  const userWon = (yesAmount > 0 && prediction.outcome === true) ||
                                (noAmount > 0 && prediction.outcome === false);
                  if (userWon) {
                    stakes.push('ETH');
                  }
                }
              }
            }
            if (stake.SWIPE && !stake.SWIPE.claimed) {
              const yesAmount = Number(stake.SWIPE.yesAmount) || 0;
              const noAmount = Number(stake.SWIPE.noAmount) || 0;
              const hasStake = yesAmount > 0 || noAmount > 0;

              if (hasStake) {
                if (prediction.cancelled) {
                  // For cancelled predictions, user can always claim refund
                  stakes.push('SWIPE');
                } else {
                  // For resolved predictions, check if user won
                  const userWon = (yesAmount > 0 && prediction.outcome === true) ||
                                (noAmount > 0 && prediction.outcome === false);
                  if (userWon) {
                    stakes.push('SWIPE');
                  }
                }
              }
            }
          } else {
            // Single stake (V1) - always ETH
            if (!stake.claimed) {
              const yesAmount = Number(stake.yesAmount) || 0;
              const noAmount = Number(stake.noAmount) || 0;
              const hasStake = yesAmount > 0 || noAmount > 0;

              if (hasStake) {
                if (prediction.cancelled) {
                  // For cancelled predictions, user can always claim refund
                  stakes.push('ETH');
                } else {
                  // For resolved predictions, check if user won
                  const userWon = (yesAmount > 0 && prediction.outcome === true) ||
                                (noAmount > 0 && prediction.outcome === false);
                  if (userWon) {
                    stakes.push('ETH');
                  }
                }
              }
            }
          }

          if (stakes.length > 0) {
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
    const usdcPredictions = allPredictions.filter(p => {
      const predAny = p as any;
      return predAny.usdcPoolEnabled && 
             ((predAny.usdcResolved && !predAny.usdcCancelled) || predAny.usdcCancelled) &&
             !processedPredictions.has(p.id);
    });

    if (usdcPredictions.length > 0) {
      // Check USDC stakes from Redis
      for (const prediction of usdcPredictions) {
        const stakeKey = REDIS_KEYS.USER_STAKES(normalizedUserId, prediction.id);
        const stakeData = await redis.get(stakeKey);
        
        if (stakeData) {
          const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
          const predAny = prediction as any;
          
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
          const predAny = prediction as any;
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

