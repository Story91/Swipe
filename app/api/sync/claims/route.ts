import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redis, redisHelpers } from '../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/sync/claims - Sync claim status from blockchain to Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting claims sync from blockchain to Redis...');

    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    const userId = searchParams.get('userId');

    let syncedCount = 0;
    let errorsCount = 0;

    if (predictionId) {
      // Sync specific prediction
      const prediction = await redisHelpers.getPrediction(predictionId);
      if (!prediction) {
        return NextResponse.json(
          { success: false, error: 'Prediction not found in Redis' },
          { status: 404 }
        );
      }

      const contractVersion = prediction.contractVersion || 'V2';
      const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
      const numericId = predictionId.replace(/^pred_(v1|v2)_/, '');

      if (userId) {
        // Sync specific user's claim status
        try {
          const stakeKey = `user_stakes:${userId}:${predictionId}`;
          const existingData = await redis.get(stakeKey);
          
          if (existingData) {
            const existingStake = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
            
            // Check claim status on blockchain
            const isClaimedOnChain = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'userStakes',
              args: [BigInt(numericId), userId as `0x${string}`],
            });

            // Update Redis if different
            if (isClaimedOnChain && !existingStake.claimed) {
              existingStake.claimed = true;
              await redisHelpers.saveUserStake(existingStake);
              syncedCount++;
              console.log(`✅ Synced claim status for user ${userId} on prediction ${predictionId}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync claim for user ${userId}:`, error);
          errorsCount++;
        }
      } else {
        // Sync all users' claim status for this prediction
        const stakes = await redisHelpers.getUserStakes(predictionId);
        
        for (const stake of stakes) {
          try {
            // Check claim status on blockchain
            const isClaimedOnChain = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'userStakes',
              args: [BigInt(numericId), stake.user as `0x${string}`],
            });

            // Update Redis if different
            if (isClaimedOnChain && !stake.claimed) {
              stake.claimed = true;
              await redisHelpers.saveUserStake(stake);
              syncedCount++;
              console.log(`✅ Synced claim status for user ${stake.user} on prediction ${predictionId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to sync claim for user ${stake.user}:`, error);
            errorsCount++;
          }
        }
      }
    } else {
      // Sync all predictions' claims
      console.log('🔄 Syncing claims for all predictions...');
      const allPredictions = await redisHelpers.getAllPredictions();
      
      for (const prediction of allPredictions) {
        try {
          const contractVersion = prediction.contractVersion || 'V2';
          const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
          const numericId = prediction.id.replace(/^pred_(v1|v2)_/, '');
          
          // Get all stakes for this prediction
          const stakes = await redisHelpers.getUserStakes(prediction.id);
          
          for (const stake of stakes) {
            try {
              // Check claim status on blockchain
              const isClaimedOnChain = await publicClient.readContract({
                address: contract.address as `0x${string}`,
                abi: contract.abi,
                functionName: 'userStakes',
                args: [BigInt(numericId), stake.user as `0x${string}`],
              });

              // Update Redis if different
              if (isClaimedOnChain && !stake.claimed) {
                stake.claimed = true;
                await redisHelpers.saveUserStake(stake);
                syncedCount++;
                console.log(`✅ Synced claim status for user ${stake.user} on prediction ${prediction.id}`);
              }
            } catch (error) {
              console.error(`❌ Failed to sync claim for user ${stake.user} on prediction ${prediction.id}:`, error);
              errorsCount++;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync claims for prediction ${prediction.id}:`, error);
          errorsCount++;
        }
      }
    }

    console.log(`🎉 Claims sync completed! Synced: ${syncedCount} claims, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Claims sync completed',
      data: {
        syncedCount,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Claims sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync claims from blockchain to Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
