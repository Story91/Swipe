import { NextRequest, NextResponse } from 'next/server';
import { createChainPublicClient } from '@/lib/chains';
import { CONTRACTS } from '../../../../../lib/contract';
import { redisHelpers } from '../../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createChainPublicClient();

/**
 * Every read below goes to CONTRACTS.V2, which is a Base address, so the Redis
 * records written from it are Base's. Named rather than left to the default: a
 * sync route that inherits its chain is one config change away from writing one
 * chain's contract state into another chain's keyspace, and the value would be
 * right either way today, which is exactly what makes it worth pinning.
 */
const SYNC_CHAIN = 'base' as const;

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
    const allPredictions = await redisHelpers.getAllPredictions(SYNC_CHAIN);
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

        const predictionId = `pred_v2_${i}`;

        // Parse prediction data (V2 ABI order)
        const [question, description, category, imageUrl, yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount, deadline, resolutionDeadline, resolved, outcome, cancelled, createdAt, creator, verified, approved, needsApproval, creationToken, creationTokenAmount] = predictionData as any[];

        const deadlineNum = Number(deadline);

        // Validate deadline - skip predictions with deadline 0 (uninitialized)
        if (!deadlineNum || deadlineNum <= 0 || isNaN(deadlineNum)) {
          console.log(`⚠️ Skipping prediction ${i} - invalid deadline: ${deadlineNum}`);
          continue;
        }

        const deadlineDate = new Date(deadlineNum * 1000);
        if (isNaN(deadlineDate.getTime())) {
          console.error(`❌ Invalid date created from deadline ${deadline} for prediction ${i}`);
          continue;
        }

        // Get participants from contract (needed for stake sync and totalStakes)
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Get existing prediction from Redis to preserve non-blockchain fields
        const existingPrediction = await redisHelpers.getPrediction(predictionId, SYNC_CHAIN);

        // Convert contract data to Redis format - preserve existing non-blockchain fields
        const redisPrediction = {
          id: predictionId,
          question: String(question),
          description: String(description),
          category: String(category),
          imageUrl: String(imageUrl),
          // Preserve existing non-blockchain fields, or use defaults for new predictions
          includeChart: existingPrediction?.includeChart ?? false,
          selectedCrypto: existingPrediction?.selectedCrypto ?? '',
          endDate: deadlineDate.toISOString().split('T')[0],
          endTime: deadlineDate.toISOString().split('T')[1].split('.')[0],
          deadline: deadlineNum,
          resolutionDeadline: Number(resolutionDeadline),
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          swipeYesTotalAmount: Number(swipeYesTotalAmount),
          swipeNoTotalAmount: Number(swipeNoTotalAmount),
          resolved: Boolean(resolved),
          outcome: Boolean(outcome),
          cancelled: Boolean(cancelled),
          createdAt: Number(createdAt),
          creator: String(creator),
          verified: Boolean(verified),
          approved: true, // V2 predictions are auto-approved
          needsApproval: Boolean(needsApproval),
          participants: participants.map(p => String(p).toLowerCase()),
          totalStakes: participants.length,
          contractVersion: 'V2' as const
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction, SYNC_CHAIN);
        syncedPredictions++;

        // Sync user stakes for each participant (V2 has no getPredictionStakes;
        // stakes live in the userStakes / userSwipeStakes mappings)
        for (const participant of participants) {
          try {
            const [userStakeData, userSwipeStakeData] = await Promise.all([
              retryWithBackoff(async () => {
                return await publicClient.readContract({
                  address: CONTRACTS.V2.address as `0x${string}`,
                  abi: CONTRACTS.V2.abi,
                  functionName: 'userStakes',
                  args: [BigInt(i), participant],
                });
              }) as unknown as [bigint, bigint, boolean],

              retryWithBackoff(async () => {
                return await publicClient.readContract({
                  address: CONTRACTS.V2.address as `0x${string}`,
                  abi: CONTRACTS.V2.abi,
                  functionName: 'userSwipeStakes',
                  args: [BigInt(i), participant],
                });
              }) as unknown as [bigint, bigint, boolean]
            ]);

            // V2 returns struct {yesAmount, noAmount, claimed}
            const ethYesAmount = userStakeData[0] || 0;
            const ethNoAmount = userStakeData[1] || 0;
            const ethClaimed = userStakeData[2] || false;

            const swipeYesAmount = userSwipeStakeData[0] || 0;
            const swipeNoAmount = userSwipeStakeData[1] || 0;
            const swipeClaimed = userSwipeStakeData[2] || false;

            const userStake: any = {
              user: participant.toLowerCase(),
              predictionId: predictionId,
              stakedAt: Math.floor(Date.now() / 1000),
              contractVersion: 'V2' as const
            };

            if (ethYesAmount > 0 || ethNoAmount > 0) {
              userStake.ETH = {
                yesAmount: Number(ethYesAmount),
                noAmount: Number(ethNoAmount),
                claimed: ethClaimed,
                tokenType: 'ETH' as const
              };
              syncedStakes++;
            }

            if (swipeYesAmount > 0 || swipeNoAmount > 0) {
              userStake.SWIPE = {
                yesAmount: Number(swipeYesAmount),
                noAmount: Number(swipeNoAmount),
                claimed: swipeClaimed,
                tokenType: 'SWIPE' as const
              };
              syncedStakes++;
            }

            if (userStake.ETH || userStake.SWIPE) {
              await redisHelpers.saveUserStake(userStake, SYNC_CHAIN);
            }
          } catch (stakeError) {
            console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
            errorsCount++;
          }
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
