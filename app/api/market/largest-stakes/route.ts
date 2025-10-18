import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../../lib/redis';
import { RedisUserStake, RedisPrediction } from '../../../../lib/types/redis';

interface LargestStakesUser {
  rank: number;
  address: string;
  totalStaked: number;
  totalStakedETH: number;
  predictionsParticipated: number;
  avgStakePerPrediction: number;
}

// GET /api/market/largest-stakes - Get users with largest total stakes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const timeframe = searchParams.get('timeframe') || 'all';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    console.log(`🔍 Fetching largest stakes users (limit: ${limit}, timeframe: ${timeframe}, forceRefresh: ${forceRefresh})`);

    // Check cache first (unless force refresh)
    const cacheKey = `largest_stakes:${timeframe}:${limit}`;
    
    if (!forceRefresh) {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`✅ Returning cached largest stakes data for ${timeframe}`);
        const parsedCache = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        return NextResponse.json({
          success: true,
          data: parsedCache,
          count: parsedCache.length,
          timeframe,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`🔄 Computing largest stakes data for ${timeframe} (cache miss or force refresh)`);

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();

    // Filter by timeframe if needed
    let filteredPredictions = allPredictions;
    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 30;
      const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
      filteredPredictions = allPredictions.filter(p => p.createdAt >= cutoffTime);
    }

    console.log(`📊 Processing ${filteredPredictions.length} predictions for timeframe ${timeframe}`);

    // Aggregate user stakes
    const userStakes: { [address: string]: LargestStakesUser } = {};

    // Get all unique users from predictions
    const allUsers = new Set<string>();
    filteredPredictions.forEach(p => {
      p.participants.forEach(participant => allUsers.add(participant));
    });

    console.log(`👥 Found ${allUsers.size} unique users`);

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

    console.log(`✅ Found ${sortedUsers.length} users with largest stakes`);

    // Cache the results for 1 hour (3600 seconds)
    await redis.setex(cacheKey, 3600, JSON.stringify(sortedUsers));
    console.log(`💾 Cached largest stakes data for ${timeframe} with key: ${cacheKey}`);

    return NextResponse.json({
      success: true,
      data: sortedUsers,
      count: sortedUsers.length,
      timeframe,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get largest stakes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch largest stakes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
