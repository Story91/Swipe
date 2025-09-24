import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../../lib/contract';
import { redisHelpers } from '../../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// Helper function for retry with backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.log(`❌ Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Helper function to find highest V2 prediction ID in Redis
async function findHighestV2PredictionId(): Promise<number> {
  try {
    const allPredictions = await redisHelpers.getAllPredictions();
    const v2Predictions = allPredictions.filter(p => p.id.startsWith('pred_v2_'));
    
    if (v2Predictions.length === 0) {
      console.log('📊 No V2 predictions found in Redis, starting from 0');
      return 0;
    }
    
    // Extract numeric IDs and find the highest
    const numericIds = v2Predictions
      .map(p => {
        const match = p.id.match(/^pred_v2_(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(id => id > 0);
    
    const highestId = Math.max(...numericIds);
    console.log(`📊 Found highest V2 prediction ID in Redis: ${highestId}`);
    
    return highestId;
  } catch (error) {
    console.error('❌ Failed to find highest V2 prediction ID:', error);
    return 0;
  }
}

// GET /api/sync/v2/incremental - Incremental V2 sync (only new predictions)
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting V2 incremental sync...');

    // Find highest V2 prediction ID in Redis
    const highestRedisId = await findHighestV2PredictionId();
    
    // Get total prediction count from V2 contract
    const totalCount = await retryWithBackoff(async () => {
      return await publicClient.readContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'nextPredictionId',
        args: []
      });
    });

    const totalCountNumber = Number(totalCount);
    console.log(`📊 Contract has ${totalCountNumber} total predictions`);
    console.log(`📊 Redis has up to prediction ${highestRedisId}`);
    
    // Calculate how many new predictions to sync
    const newPredictionsCount = totalCountNumber - 1 - highestRedisId;
    
    if (newPredictionsCount <= 0) {
      console.log('✅ No new predictions to sync');
      return NextResponse.json({
        success: true,
        message: 'No new predictions to sync',
        data: {
          syncedPredictions: 0,
          syncedStakes: 0,
          errorsCount: 0,
          highestRedisId,
          totalContractPredictions: totalCountNumber - 1,
          newPredictionsFound: 0
        },
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🔄 Found ${newPredictionsCount} new predictions to sync (${highestRedisId + 1} to ${totalCountNumber - 1})`);

    let syncedPredictions = 0;
    let syncedStakes = 0;
    let errorsCount = 0;

    // Sync only new predictions (from highestRedisId + 1 to totalCount - 1)
    for (let i = highestRedisId + 1; i < totalCountNumber; i++) {
      try {
        console.log(`🔄 Syncing V2 prediction ${i}/${totalCountNumber-1}...`);

        // Get prediction data from contract
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'predictions',
            args: [BigInt(i)]
          });
        });

        if (!predictionData || (Array.isArray(predictionData) && predictionData.length === 0)) {
          console.log(`⚠️ No data found for prediction ${i}, skipping...`);
          continue;
        }

        // Convert contract data to Redis format
        const predictionArray = predictionData as any[];
        const redisPrediction = {
          id: `pred_v2_${i}`,
          question: predictionArray[0] || '',
          description: predictionArray[1] || '',
          category: predictionArray[2] || 'general',
          imageUrl: predictionArray[3] || '',
          includeChart: false,
          endDate: new Date(Number(predictionArray[4]) * 1000).toISOString().split('T')[0],
          endTime: new Date(Number(predictionArray[4]) * 1000).toTimeString().split(' ')[0],
          deadline: Number(predictionArray[4]),
          resolutionDeadline: Number(predictionArray[4]) + (7 * 24 * 60 * 60), // 7 days after deadline
          yesTotalAmount: Number(predictionArray[5]),
          noTotalAmount: Number(predictionArray[6]),
          swipeYesTotalAmount: Number(predictionArray[7]),
          swipeNoTotalAmount: Number(predictionArray[8]),
          resolved: predictionArray[9],
          outcome: predictionArray[10] ? Boolean(predictionArray[10]) : undefined,
          cancelled: predictionArray[11],
          createdAt: Number(predictionArray[12]),
          creator: predictionArray[13] || '0x0000000000000000000000000000000000000000',
          verified: false,
          approved: true,
          needsApproval: false,
          participants: [],
          totalStakes: Number(predictionArray[5]) + Number(predictionArray[6]) + Number(predictionArray[7]) + Number(predictionArray[8]),
          contractVersion: 'V2' as const
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);
        syncedPredictions++;

        // Sync stakes for this prediction
        try {
          const stakesData = await retryWithBackoff(async () => {
            return await publicClient.readContract({
              address: CONTRACTS.V2.address as `0x${string}`,
              abi: CONTRACTS.V2.abi,
              functionName: 'getPredictionStakes',
              args: [BigInt(i)]
            });
          });

          if (stakesData && Array.isArray(stakesData) && stakesData.length > 0) {
            for (const stake of stakesData) {
              try {
                const redisStake = {
                  user: stake[0],
                  predictionId: `pred_v2_${i}`,
                  yesAmount: Number(stake[1]),
                  noAmount: Number(stake[2]),
                  claimed: stake[3],
                  stakedAt: Number(stake[4]),
                  contractVersion: 'V2' as const,
                  tokenType: 'ETH' as const
                };

                await redisHelpers.saveUserStake(redisStake);
                syncedStakes++;
              } catch (stakeError) {
                console.error(`❌ Failed to sync stake for prediction ${i}:`, stakeError);
                errorsCount++;
              }
            }
          }
        } catch (stakesError) {
          console.error(`❌ Failed to sync stakes for prediction ${i}:`, stakesError);
          errorsCount++;
        }

        console.log(`✅ Synced prediction ${i} successfully`);

      } catch (error) {
        console.error(`❌ Failed to sync prediction ${i}:`, error);
        errorsCount++;
      }
    }

    console.log(`✅ V2 incremental sync completed!`);
    console.log(`📊 Synced: ${syncedPredictions} predictions, ${syncedStakes} stakes, ${errorsCount} errors`);

    return NextResponse.json({
      success: true,
      message: 'V2 incremental sync completed successfully',
      data: {
        syncedPredictions,
        syncedStakes,
        errorsCount,
        highestRedisId,
        totalContractPredictions: totalCountNumber - 1,
        newPredictionsFound: newPredictionsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 incremental sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync V2 contract data incrementally',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
