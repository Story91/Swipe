import { NextRequest, NextResponse } from 'next/server';
import { createChainPublicClient } from '@/lib/chains';
import { redisHelpers, redis, REDIS_KEYS } from '../../../../lib/redis';
import { CONTRACTS } from '../../../../lib/contract';
import { RedisUserStake } from '../../../../lib/types/redis';

/**
 * POST /api/admin/rescan-v2-leaderboard
 * Rescan V2 contract and update leaderboard with accurate stake data
 * This reads actual user stakes from blockchain (not simplified distribution)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting V2 contract rescan for leaderboard...');

    // Get all predictions from Redis
    // The V2 contract rescanned below is a Base contract, so this is Base's
    // leaderboard and nothing else. Pinned rather than defaulted.
    const allPredictions = await redisHelpers.getAllPredictions('base');
    console.log(`📊 Found ${allPredictions.length} predictions in Redis`);

    // Filter only V2 predictions
    const v2Predictions = allPredictions.filter(p => p.id.startsWith('pred_v2_'));
    console.log(`📊 Processing ${v2Predictions.length} V2 predictions`);

    // Initialize public client
    const publicClient = createChainPublicClient();

    // Aggregate user stakes data (accurate - from blockchain)
    const userStakesMap = new Map<string, {
      totalStakedETH: number;
      totalStakedSWIPE: number;
      predictionsParticipated: Set<string>;
      ethStakes: Array<{predictionId: string, amount: number, isYes: boolean}>;
      swipeStakes: Array<{predictionId: string, amount: number, isYes: boolean}>;
    }>();

    // Process each V2 prediction
    for (let i = 0; i < v2Predictions.length; i++) {
      const prediction = v2Predictions[i];
      const predictionId = prediction.id;
      const numericId = predictionId.replace('pred_v2_', '');
      
      try {
        console.log(`📊 Processing V2 prediction ${i + 1}/${v2Predictions.length}: ${numericId}`);

        // Get participants from blockchain
        const participants = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'getParticipants',
          args: [BigInt(numericId)],
        }) as string[];

        console.log(`  👥 Found ${participants.length} participants`);

        // For each participant, get their actual stakes from blockchain
        let foundStakesCount = 0;
        for (const participant of participants) {
          const userId = participant.toLowerCase();
          
          try {
            // Get actual ETH and SWIPE stakes from blockchain
            // V2 returns struct as tuple: [yesAmount, noAmount, claimed]
            const [ethStakeData, swipeStakeData] = await Promise.all([
              publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userStakes',
                args: [BigInt(numericId), participant as `0x${string}`],
              }) as Promise<[bigint, bigint, boolean]>,
              publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userSwipeStakes',
                args: [BigInt(numericId), participant as `0x${string}`],
              }) as Promise<[bigint, bigint, boolean]>
            ]);

            // Extract from tuple: [yesAmount, noAmount, claimed]
            const ethYes = Number(ethStakeData[0] || 0);
            const ethNo = Number(ethStakeData[1] || 0);
            const ethClaimed = ethStakeData[2] || false;
            const swipeYes = Number(swipeStakeData[0] || 0);
            const swipeNo = Number(swipeStakeData[1] || 0);
            const swipeClaimed = swipeStakeData[2] || false;

            const hasEthStake = ethYes > 0 || ethNo > 0;
            const hasSwipeStake = swipeYes > 0 || swipeNo > 0;

            // Log stake details for debugging
            if (hasEthStake || hasSwipeStake) {
              console.log(`    💰 Found stakes for ${userId.slice(0, 8)}...: ETH=${(ethYes + ethNo) / 1e18} SWIPE=${(swipeYes + swipeNo) / 1e18}`);
              foundStakesCount++;
            }

            // Only process if user has any stake
            if (hasEthStake || hasSwipeStake) {
              // Initialize user data if needed
              if (!userStakesMap.has(userId)) {
                userStakesMap.set(userId, {
                  totalStakedETH: 0,
                  totalStakedSWIPE: 0,
                  predictionsParticipated: new Set(),
                  ethStakes: [],
                  swipeStakes: []
                });
              }

              const userData = userStakesMap.get(userId)!;
              
              // Add to predictionsParticipated (counts as 1 bet)
              userData.predictionsParticipated.add(predictionId);

              // Add ETH stakes
              if (hasEthStake) {
                const ethAmount = ethYes + ethNo;
                userData.totalStakedETH += ethAmount;
                userData.ethStakes.push({
                  predictionId,
                  amount: ethAmount,
                  isYes: ethYes > ethNo
                });
              }

              // Add SWIPE stakes
              if (hasSwipeStake) {
                const swipeAmount = swipeYes + swipeNo;
                userData.totalStakedSWIPE += swipeAmount;
                userData.swipeStakes.push({
                  predictionId,
                  amount: swipeAmount,
                  isYes: swipeYes > swipeNo
                });
              }

              // Update Redis stake data (for SwipeClaim to use)
              const stakeKey = REDIS_KEYS.USER_STAKES(userId, predictionId, 'base');
              const stakeData = {
                ETH: {
                  yesAmount: ethYes,
                  noAmount: ethNo,
                  claimed: ethClaimed
                },
                SWIPE: {
                  yesAmount: swipeYes,
                  noAmount: swipeNo,
                  claimed: swipeClaimed
                }
              };
              await redis.set(stakeKey, JSON.stringify(stakeData));
            }
          } catch (error) {
            console.warn(`  ⚠️ Error fetching stakes for ${participant} in prediction ${numericId}:`, error);
          }
        }

        if (foundStakesCount > 0) {
          console.log(`    ✅ Found ${foundStakesCount} users with stakes in prediction ${numericId}`);
        }

        // Small delay to avoid rate limiting
        if (i < v2Predictions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error processing prediction ${numericId}:`, error);
      }
    }

    console.log(`👥 Found ${userStakesMap.size} unique users with stakes`);

    // Convert to leaderboard format (keep in wei like debug/leaderboard-data for consistency)
    const leaderboardData = Array.from(userStakesMap.entries()).map(([address, data]) => ({
      address,
      totalStakedETH: data.totalStakedETH, // Keep in wei (will be divided by 1e18 in component)
      totalStakedSWIPE: data.totalStakedSWIPE, // Keep in wei (will be divided by 1e18 in component)
      predictionsParticipated: data.predictionsParticipated.size,
      ethStakes: data.ethStakes,
      swipeStakes: data.swipeStakes
    }));

    // Sort by ETH stakes (descending) - compare in wei
    const ethLeaderboard = [...leaderboardData]
      .filter(user => user.totalStakedETH > 0)
      .sort((a, b) => Number(b.totalStakedETH) - Number(a.totalStakedETH))
      .slice(0, 20)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
        pool: 'ETH'
      }));

    // Sort by SWIPE stakes (descending) - compare in wei
    const swipeLeaderboard = [...leaderboardData]
      .filter(user => user.totalStakedSWIPE > 0)
      .sort((a, b) => Number(b.totalStakedSWIPE) - Number(a.totalStakedSWIPE))
      .slice(0, 20)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
        pool: 'SWIPE'
      }));

    console.log(`🏆 ETH Leaderboard: ${ethLeaderboard.length} users`);
    console.log(`🏆 SWIPE Leaderboard: ${swipeLeaderboard.length} users`);

    // Save to Redis (same format as /api/debug/leaderboard-data)
    const result = {
      ethLeaderboard,
      swipeLeaderboard,
      farcasterProfiles: [], // Can be populated separately
      totalUsers: userStakesMap.size,
      totalPredictions: v2Predictions.length,
      summary: {
        totalETHStaked: leaderboardData.reduce((sum, user) => sum + Number(user.totalStakedETH) / 1e18, 0), // Convert to ETH for summary
        totalSWIPEStaked: leaderboardData.reduce((sum, user) => sum + Number(user.totalStakedSWIPE) / 1e18, 0), // Convert to SWIPE for summary
        totalPredictionsParticipated: leaderboardData.reduce((sum, user) => sum + user.predictionsParticipated, 0)
      }
    };

    // Save to Redis cache (24 hours) - use same key as getRealLeaderboardData()
    const cacheKey = REDIS_KEYS.REAL_LEADERBOARD('base');
    await redis.setex(cacheKey, 86400, JSON.stringify(result)); // 24 hours instead of 1 hour
    console.log('💾 Saved updated leaderboard data to Redis (24h cache)');

    return NextResponse.json({
      success: true,
      message: 'V2 contract rescanned and leaderboard updated',
      data: {
        totalUsers: userStakesMap.size,
        totalV2Predictions: v2Predictions.length,
        ethLeaderboardCount: ethLeaderboard.length,
        swipeLeaderboardCount: swipeLeaderboard.length,
        summary: result.summary
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to rescan V2 leaderboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to rescan V2 leaderboard',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

