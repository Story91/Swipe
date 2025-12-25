import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../../lib/redis';

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

          // Must be resolved (not cancelled)
          const isResolved = prediction.resolved && !prediction.cancelled;
          if (!isResolved || processedPredictions.has(predictionId)) {
            return null;
          }

          // Check if user can claim (same logic as EnhancedUserDashboard)
          const stakes = [];
          
          // Handle multi-token stake (V2)
          if (stake.ETH || stake.SWIPE) {
            if (stake.ETH && !stake.ETH.claimed) {
              const yesAmount = Number(stake.ETH.yesAmount) || 0;
              const noAmount = Number(stake.ETH.noAmount) || 0;
              if (yesAmount > 0 || noAmount > 0) {
                const userWon = (yesAmount > 0 && prediction.outcome === true) || 
                              (noAmount > 0 && prediction.outcome === false);
                if (userWon) {
                  stakes.push('ETH');
                }
              }
            }
            if (stake.SWIPE && !stake.SWIPE.claimed) {
              const yesAmount = Number(stake.SWIPE.yesAmount) || 0;
              const noAmount = Number(stake.SWIPE.noAmount) || 0;
              if (yesAmount > 0 || noAmount > 0) {
                const userWon = (yesAmount > 0 && prediction.outcome === true) || 
                              (noAmount > 0 && prediction.outcome === false);
                if (userWon) {
                  stakes.push('SWIPE');
                }
              }
            }
          } else {
            // Single stake (V1) - always ETH
            if (!stake.claimed) {
              const yesAmount = Number(stake.yesAmount) || 0;
              const noAmount = Number(stake.noAmount) || 0;
              if (yesAmount > 0 || noAmount > 0) {
                const userWon = (yesAmount > 0 && prediction.outcome === true) || 
                              (noAmount > 0 && prediction.outcome === false);
                if (userWon) {
                  stakes.push('ETH');
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

