import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../../../lib/redis';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../../lib/contract';

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// GET /api/sync/v2/resolved - Sync resolved predictions from V2 contract
export async function GET(request: NextRequest) {
  try {
    console.log('🚀 Starting V2 resolved predictions sync...');

    // Initialize public client for Base network
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    // Get total prediction count
    const totalCount = await retryWithBackoff(async () => {
      return await publicClient.readContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'nextPredictionId',
        args: []
      });
    });

    const totalCountNumber = Number(totalCount);
    console.log(`📊 Found ${totalCountNumber} total predictions on V2 contract`);

    let resolvedPredictions = 0;
    let syncedStakes = 0;

    // Sync all predictions from 1 to totalCount-1
    for (let i = 1; i < totalCountNumber; i++) {
      try {
        // Get prediction data from blockchain
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        });

        // Parse prediction data (V2 ABI order - same as main sync)
        const [question, description, category, imageUrl, yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount, deadline, resolutionDeadline, resolved, outcome, cancelled, createdAt, creator, verified, approved, needsApproval, creationToken, creationTokenAmount] = predictionData as any[];

        // Convert BigInt values to proper types immediately
        const deadlineNum = Number(deadline);
        const resolvedBool = Boolean(resolved);
        const outcomeBool = Boolean(outcome);
        const cancelledBool = Boolean(cancelled);

        // Only process resolved predictions
        if (!resolvedBool && !cancelledBool) {
          continue;
        }

        console.log(`🔄 Syncing resolved V2 prediction ${i}: ${String(question).substring(0, 50)}...`);

        // Get participants
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        const predictionId = `pred_v2_${i}`;
        
        // Debug: Log participants data
        console.log(`🔍 Prediction ${i} participants:`, {
          participants: participants,
          participantsLength: participants.length,
          participantsType: typeof participants,
          firstParticipant: participants[0]
        });
        
        // Convert all BigInt values to Number/Boolean
        const yesTotal = Number(yesTotalAmount);
        const noTotal = Number(noTotalAmount);
        const swipeYesTotal = Number(swipeYesTotalAmount);
        const swipeNoTotal = Number(swipeNoTotalAmount);
        const verifiedBool = Boolean(verified);
        const needsApprovalBool = Boolean(needsApproval);

        // Validate deadline
        if (!deadlineNum || deadlineNum <= 0) {
          console.error(`❌ Invalid deadline for prediction ${i}: ${deadlineNum}`);
          continue;
        }

        // Create safe date strings (deadline is in seconds, convert to milliseconds)
        const deadlineDate = new Date(deadlineNum * 1000);
        
        // Check if date is valid
        if (isNaN(deadlineDate.getTime())) {
          console.error(`❌ Invalid date for prediction ${i}: deadline=${deadlineNum}`);
          continue;
        }
        
        const endDate = deadlineDate.toISOString().split('T')[0];
        const endTimeStr = deadlineDate.toISOString().split('T')[1].split('.')[0];

        // Get existing prediction from Redis to preserve non-blockchain fields
        const existingPrediction = await redisHelpers.getPrediction(predictionId);

        // Create Redis prediction object - preserve existing non-blockchain fields
        const redisPrediction = {
          id: predictionId,
          question: String(question),
          description: String(description),
          category: String(category),
          imageUrl: String(imageUrl),
          deadline: deadlineNum, // Deadline is already in seconds
          yesTotalAmount: yesTotal,
          noTotalAmount: noTotal,
          swipeYesTotalAmount: swipeYesTotal,
          swipeNoTotalAmount: swipeNoTotal,
          resolved: resolvedBool,
          outcome: outcomeBool,
          cancelled: cancelledBool,
          creator: String(creator),
          verified: verifiedBool,
          needsApproval: needsApprovalBool,
          approved: true, // V2 predictions are auto-approved
          // Preserve existing non-blockchain fields, or use defaults for new predictions
          includeChart: existingPrediction?.includeChart ?? false,
          selectedCrypto: existingPrediction?.selectedCrypto ?? '',
          endDate: endDate,
          endTime: endTimeStr,
          participants: participants.map(p => String(p).toLowerCase()),
          totalStakes: participants.length,
          createdAt: existingPrediction?.createdAt ?? Math.floor(Date.now() / 1000),
          contractVersion: 'V2' as const
        };

        // Save prediction to Redis
        await redisHelpers.savePrediction(redisPrediction);
        resolvedPredictions++;

        // Sync user stakes for each participant
        let stakesCount = 0;
        for (const participant of participants) {
          try {
            // Get both ETH and SWIPE stake data
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

            // Only save if user has stakes
            if (ethYesAmount > 0 || ethNoAmount > 0 || swipeYesAmount > 0 || swipeNoAmount > 0) {
              const stakeData = {
                user: participant.toLowerCase(),
                predictionId: predictionId,
                stakedAt: Math.floor(Date.now() / 1000),
                contractVersion: 'V2' as const,
                ETH: {
                  yesAmount: Number(ethYesAmount),
                  noAmount: Number(ethNoAmount),
                  claimed: Boolean(ethClaimed)
                },
                SWIPE: {
                  yesAmount: Number(swipeYesAmount),
                  noAmount: Number(swipeNoAmount),
                  claimed: Boolean(swipeClaimed)
                }
              };

              // Save stake to Redis
              const stakeKey = `user_stakes:${participant.toLowerCase()}:${predictionId}`;
              await redis.set(stakeKey, JSON.stringify(stakeData));
              stakesCount++;
              
              console.log(`💰 Synced stake for user ${participant}: ETH claimed=${ethClaimed}, SWIPE claimed=${swipeClaimed}`);
            }
          } catch (error) {
            console.error(`❌ Failed to sync stakes for user ${participant} in prediction ${i}:`, error);
          }
        }
        
        syncedStakes += stakesCount;
        console.log(`✅ Synced resolved V2 prediction ${i}: ${String(question).substring(0, 50)}... (${stakesCount} stakes, outcome: ${outcomeBool}, cancelled: ${cancelledBool})`);

      } catch (error) {
        console.error(`❌ Failed to sync resolved V2 prediction ${i}:`, error);
      }
    }

    console.log(`🎉 V2 resolved sync completed: ${resolvedPredictions} predictions synced, ${syncedStakes} stakes synced`);

    return NextResponse.json({
      success: true,
      data: {
        syncedPredictions: resolvedPredictions,
        syncedStakes: syncedStakes,
        totalChecked: totalCountNumber - 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 resolved sync failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
