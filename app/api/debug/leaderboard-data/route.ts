import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers, redis } from '../../../../lib/redis';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting leaderboard data collection...');

    // Check cache first
    const cacheKey = 'real_leaderboard_data';
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log('✅ Returning cached real leaderboard data');
      const parsedCache = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      return NextResponse.json({
        success: true,
        data: parsedCache,
        cached: true
      });
    }

    console.log('🔄 No cache found, generating real leaderboard data...');

    // Get all predictions from Redis
    const allPredictions = await redisHelpers.getAllPredictions();
    console.log(`📊 Found ${allPredictions.length} predictions`);

    // Aggregate user stakes data
    const userStakesMap = new Map<string, {
      totalStakedETH: number;
      totalStakedSWIPE: number;
      predictionsParticipated: Set<string>;
      ethStakes: Array<{predictionId: string, amount: number, isYes: boolean}>;
      swipeStakes: Array<{predictionId: string, amount: number, isYes: boolean}>;
    }>();

    // Initialize public client for Base network
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    // Process each prediction - get participants from blockchain
    for (const prediction of allPredictions) {
      const predictionId = prediction.id;
      
      // Get participants from blockchain (like TinderCard does)
      let participants: string[] = [];
      try {
        const numericId = predictionId.replace('pred_v1_', '').replace('pred_v2_', '');
        participants = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'getParticipants',
          args: [BigInt(numericId)],
        }) as string[];
        
        // Convert to lowercase for consistency
        participants = participants.map(p => p.toLowerCase());
      } catch (error) {
        console.warn(`⚠️ Could not fetch participants for prediction ${predictionId}:`, error);
        // Fallback to Redis participants
        participants = prediction.participants || [];
      }
      
      console.log(`📊 Processing prediction ${predictionId}: ${participants.length} participants`);
      
      // Calculate total ETH and SWIPE stakes for this prediction
      const totalETHStakes = (prediction.yesTotalAmount || 0) + (prediction.noTotalAmount || 0);
      const totalSWIPEStakes = (prediction.swipeYesTotalAmount || 0) + (prediction.swipeNoTotalAmount || 0);
      
      if (totalETHStakes > 0 || totalSWIPEStakes > 0) {
        // Distribute stakes among participants (simplified approach)
        const participantCount = participants.length;
        if (participantCount > 0) {
          const ethPerParticipant = totalETHStakes / participantCount;
          const swipePerParticipant = totalSWIPEStakes / participantCount;
          
          for (const participant of participants) {
            const userId = participant.toLowerCase();
            
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
            userData.predictionsParticipated.add(predictionId);
            
            // Add ETH stakes
            if (ethPerParticipant > 0) {
              userData.totalStakedETH += ethPerParticipant;
              userData.ethStakes.push({
                predictionId,
                amount: ethPerParticipant,
                isYes: (prediction.yesTotalAmount || 0) > (prediction.noTotalAmount || 0)
              });
            }
            
            // Add SWIPE stakes
            if (swipePerParticipant > 0) {
              userData.totalStakedSWIPE += swipePerParticipant;
              userData.swipeStakes.push({
                predictionId,
                amount: swipePerParticipant,
                isYes: (prediction.swipeYesTotalAmount || 0) > (prediction.swipeNoTotalAmount || 0)
              });
            }
          }
        }
      }
    }

    console.log(`👥 Found ${userStakesMap.size} unique users with stakes`);

    // Convert to array and sort
    const leaderboardData = Array.from(userStakesMap.entries()).map(([address, data]) => ({
      address,
      totalStakedETH: data.totalStakedETH,
      totalStakedSWIPE: data.totalStakedSWIPE,
      predictionsParticipated: data.predictionsParticipated.size,
      ethStakes: data.ethStakes,
      swipeStakes: data.swipeStakes
    }));

    // Sort by ETH stakes (descending)
    const ethLeaderboard = [...leaderboardData]
      .filter(user => user.totalStakedETH > 0)
      .sort((a, b) => b.totalStakedETH - a.totalStakedETH)
      .slice(0, 10)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
        pool: 'ETH'
      }));

    // Sort by SWIPE stakes (descending)
    const swipeLeaderboard = [...leaderboardData]
      .filter(user => user.totalStakedSWIPE > 0)
      .sort((a, b) => b.totalStakedSWIPE - a.totalStakedSWIPE)
      .slice(0, 10)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
        pool: 'SWIPE'
      }));

    console.log(`🏆 ETH Leaderboard: ${ethLeaderboard.length} users`);
    console.log(`🏆 SWIPE Leaderboard: ${swipeLeaderboard.length} users`);

    // Get Farcaster profiles for all unique addresses
    const allAddresses = Array.from(new Set([
      ...ethLeaderboard.map(u => u.address),
      ...swipeLeaderboard.map(u => u.address)
    ]));

    console.log(`🔍 Fetching Farcaster profiles for ${allAddresses.length} addresses...`);

    let farcasterProfiles = [];
    if (allAddresses.length > 0) {
      try {
        const profilesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/farcaster/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: allAddresses })
        });

        if (profilesResponse.ok) {
          const profilesData = await profilesResponse.json();
          if (profilesData.success) {
            farcasterProfiles = profilesData.profiles;
            console.log(`✅ Fetched ${farcasterProfiles.length} Farcaster profiles`);
          }
        } else {
          console.warn(`⚠️ Failed to fetch Farcaster profiles: ${profilesResponse.status}`);
        }
      } catch (error) {
        console.error('❌ Error fetching Farcaster profiles:', error);
      }
    } else {
      console.log('⚠️ No addresses to fetch Farcaster profiles for');
    }

    const result = {
      success: true,
      data: {
        ethLeaderboard,
        swipeLeaderboard,
        farcasterProfiles,
        totalUsers: userStakesMap.size,
        totalPredictions: allPredictions.length,
        summary: {
          totalETHStaked: leaderboardData.reduce((sum, user) => sum + user.totalStakedETH, 0),
          totalSWIPEStaked: leaderboardData.reduce((sum, user) => sum + user.totalStakedSWIPE, 0),
          totalPredictionsParticipated: leaderboardData.reduce((sum, user) => sum + user.predictionsParticipated, 0)
        }
      }
    };

    console.log('✅ Leaderboard data collection completed');
    console.log(`📊 Summary: ${result.data.summary.totalETHStaked.toFixed(4)} ETH, ${result.data.summary.totalSWIPEStaked.toFixed(0)} SWIPE staked`);

    // Save real leaderboard data to Redis cache
    try {
      console.log('💾 Saving real leaderboard data to Redis...');
      await redis.setex(cacheKey, 3600, JSON.stringify(result.data)); // Cache for 1 hour
      console.log('💾 Real leaderboard data saved to Redis');
    } catch (error) {
      console.error('❌ Failed to save real leaderboard data to Redis:', error);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Error collecting leaderboard data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
