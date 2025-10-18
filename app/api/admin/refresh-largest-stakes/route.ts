import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';
import { redisHelpers } from '../../../../lib/redis';
import { RedisUserStake, RedisPrediction } from '../../../../lib/types/redis';

interface LargestStakesUser {
  rank: number;
  address: string;
  totalStaked: number;
  totalStakedETH: number;
  predictionsParticipated: number;
  avgStakePerPrediction: number;
}

// POST /api/admin/refresh-largest-stakes - Force refresh largest stakes cache
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Admin: Force refreshing largest stakes cache');

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();
    console.log(`📊 Processing ${allPredictions.length} predictions for cache refresh`);

    // Refresh cache for different timeframes
    const timeframes = ['all', '7d', '30d', '90d'];
    const limit = 10;

    for (const timeframe of timeframes) {
      console.log(`🔄 Refreshing cache for timeframe: ${timeframe}`);

      // Filter by timeframe
      let filteredPredictions = allPredictions;
      if (timeframe !== 'all') {
        const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 30;
        const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
        filteredPredictions = allPredictions.filter(p => p.createdAt >= cutoffTime);
      }

      // Aggregate user stakes
      const userStakes: { [address: string]: LargestStakesUser } = {};

      // Get all unique users from predictions
      const allUsers = new Set<string>();
      filteredPredictions.forEach(p => {
        p.participants.forEach(participant => allUsers.add(participant));
      });

      console.log(`👥 Found ${allUsers.size} unique users for ${timeframe}`);

      // Process each user's stakes
      for (const userAddress of allUsers) {
        let totalStaked = 0;
        let predictionsParticipated = 0;

        for (const prediction of filteredPredictions) {
          // Get user's stake for this prediction
          const stakeKey = `user_stakes:${userAddress}:${prediction.id}`;
          const stakeData = await redis.get(stakeKey);

          if (stakeData) {
            const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
            
            // Handle both single stake (V1) and multi-token stake (V2) formats
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

              if (userStakeAmount > 0) {
                totalStaked += userStakeAmount;
                predictionsParticipated++;
              }
            }
          }
        }

        // Only include users with stakes
        if (totalStaked > 0) {
          userStakes[userAddress] = {
            rank: 0, // Will be set after sorting
            address: userAddress,
            totalStaked,
            totalStakedETH: totalStaked / 1e18, // Convert from wei to ETH
            predictionsParticipated,
            avgStakePerPrediction: predictionsParticipated > 0 ? totalStaked / predictionsParticipated : 0
          };
        }
      }

      // Sort by total staked amount and assign ranks
      const sortedUsers = Object.values(userStakes)
        .sort((a, b) => b.totalStaked - a.totalStaked)
        .slice(0, limit)
        .map((user, index) => ({
          ...user,
          rank: index + 1
        }));

      // Cache the results for 1 hour (3600 seconds)
      const cacheKey = `largest_stakes:${timeframe}:${limit}`;
      await redis.setex(cacheKey, 3600, JSON.stringify(sortedUsers));
      console.log(`💾 Cached ${sortedUsers.length} users for ${timeframe} with key: ${cacheKey}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Largest stakes cache refreshed successfully',
      refreshedTimeframes: timeframes,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to refresh largest stakes cache:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh largest stakes cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
