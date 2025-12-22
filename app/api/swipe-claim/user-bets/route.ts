import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../../lib/redis';
import { RedisUserStake } from '../../../../lib/types/redis';

/**
 * GET /api/swipe-claim/user-bets?address=0x...
 * Get user's bet count from Redis (counts unique predictions with stakes)
 * This is faster and more reliable than counting from blockchain
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'User address is required',
        },
        { status: 400 }
      );
    }

    // Normalize address to lowercase
    const normalizedAddress = userAddress.toLowerCase();

    // Get all predictions from Redis (same as leaderboard)
    const allPredictions = await redisHelpers.getAllPredictions();

    // Filter only V2 predictions (pred_v2_*)
    const v2Predictions = allPredictions.filter(p => p.id.startsWith('pred_v2_'));

    // Count unique predictions where user has stakes
    // EXACTLY the same logic as /api/market/largest-stakes/route.ts (lines 69-105)
    let betCount = 0;
    const predictionIdsWithStakes: string[] = [];

    for (const prediction of v2Predictions) {
      // Get user's stake for this prediction (same key format as leaderboard)
      const stakeKey = `user_stakes:${normalizedAddress}:${prediction.id}`;
      const stakeData = await redis.get(stakeKey);

      if (stakeData) {
        const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
        
        // Handle both single stake (V1) and multi-token stake (V2) formats
        // EXACTLY like /api/market/largest-stakes/route.ts does
        if (stake && typeof stake === 'object') {
          let userStakeAmount = 0;
          
          if (stake.ETH || stake.SWIPE) {
            // Multi-token stake (V2)
            if (stake.ETH) {
              userStakeAmount += stake.ETH.yesAmount + stake.ETH.noAmount;
            }
            if (stake.SWIPE) {
              userStakeAmount += stake.SWIPE.yesAmount + stake.SWIPE.noAmount;
            }
          } else if ('yesAmount' in stake) {
            // Single stake (V1)
            userStakeAmount = stake.yesAmount + stake.noAmount;
          }

          // Count this prediction as 1 bet (same logic as leaderboard's predictionsParticipated)
          if (userStakeAmount > 0) {
            betCount++;
            predictionIdsWithStakes.push(prediction.id);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        address: userAddress,
        betCount,
        source: 'redis',
        predictionIds: predictionIdsWithStakes,
        totalV2Predictions: v2Predictions.length,
        method: 'same_as_leaderboard' // Uses exact same logic as /api/market/largest-stakes
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get user bets from Redis:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch user bets',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

