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

// GET /api/sync/v2/recent?count=15 - Sync only the most recent N predictions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countParam = searchParams.get('count');
    const count = countParam ? parseInt(countParam) : 15; // Default to 15 predictions

    console.log(`🔄 Starting V2 recent sync (last ${count} predictions)...`);

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
    const startId = Math.max(1, totalCountNumber - count);
    
    console.log(`📊 Total predictions: ${totalCountNumber - 1}, syncing from ${startId} to ${totalCountNumber - 1}`);

    let syncedPredictions = 0;
    let syncedStakes = 0;
    let errorsCount = 0;

    // Sync only the most recent predictions
    for (let i = startId; i < totalCountNumber; i++) {
      try {
        console.log(`🔄 Syncing V2 prediction ${i}...`);

        // Get prediction data from blockchain
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        });

        // Get participants
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Parse prediction data (V2 ABI order)
        const [question, description, category, imageUrl, yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount, deadline, resolutionDeadline, resolved, outcome, cancelled, createdAt, creator, verified, approved, needsApproval, creationToken, creationTokenAmount] = predictionData as any[];

        const predictionId = `pred_v2_${i}`;
        const deadlineNum = Number(deadline);
        const resolvedBool = Boolean(resolved);
        const outcomeBool = Boolean(outcome);
        const cancelledBool = Boolean(cancelled);
        
        // Convert all BigInt values to Number/Boolean
        const yesTotal = Number(yesTotalAmount);
        const noTotal = Number(noTotalAmount);
        const swipeYesTotal = Number(swipeYesTotalAmount);
        const swipeNoTotal = Number(swipeNoTotalAmount);
        const verifiedBool = Boolean(verified);
        const needsApprovalBool = Boolean(needsApproval);

        // Validate deadline - skip predictions with deadline 0 (uninitialized)
        if (!deadlineNum || deadlineNum <= 0 || isNaN(deadlineNum)) {
          console.log(`⚠️ Skipping prediction ${i} - invalid deadline: ${deadlineNum}`);
          continue;
        }

        // Create safe date strings (deadline is in seconds, convert to milliseconds)
        const deadlineDate = new Date(deadlineNum * 1000);
        
        if (isNaN(deadlineDate.getTime())) {
          console.error(`❌ Invalid date for prediction ${i}`);
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
          deadline: deadlineNum,
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
          approved: true,
          // Preserve existing non-blockchain fields, or use defaults for new predictions
          includeChart: existingPrediction?.includeChart ?? false,
          selectedCrypto: existingPrediction?.selectedCrypto ?? '',
          endDate: endDate,
          endTime: endTimeStr,
          participants: participants.map(p => String(p).toLowerCase()),
          totalStakes: participants.length,
          createdAt: Number(createdAt),
          contractVersion: 'V2' as const
        };

        // Save prediction to Redis
        await redisHelpers.savePrediction(redisPrediction);
        syncedPredictions++;

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

            // Create multi-token stake object
            const userStake: any = {
              user: participant.toLowerCase(),
              predictionId: predictionId,
              stakedAt: Math.floor(Date.now() / 1000),
              contractVersion: 'V2' as const
            };

            // Add ETH stakes if any
            if (ethYesAmount > 0 || ethNoAmount > 0) {
              userStake.ETH = {
                yesAmount: Number(ethYesAmount),
                noAmount: Number(ethNoAmount),
                claimed: ethClaimed,
                tokenType: 'ETH' as const
              };
              stakesCount++;
            }

            // Add SWIPE stakes if any
            if (swipeYesAmount > 0 || swipeNoAmount > 0) {
              userStake.SWIPE = {
                yesAmount: Number(swipeYesAmount),
                noAmount: Number(swipeNoAmount),
                claimed: swipeClaimed,
                tokenType: 'SWIPE' as const
              };
              stakesCount++;
            }

            // Save stake only if user has stakes
            if (userStake.ETH || userStake.SWIPE) {
              await redisHelpers.saveUserStake(userStake);
            }

          } catch (stakeError) {
            console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
          }
        }

        syncedStakes += stakesCount;
        console.log(`✅ Synced prediction ${i}: ${String(question).substring(0, 40)}... (${stakesCount} stakes, resolved: ${resolvedBool})`);

      } catch (error) {
        console.error(`❌ Failed to sync prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 V2 recent sync completed! Synced: ${syncedPredictions} predictions, ${syncedStakes} stakes, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: `V2 recent sync completed (last ${count} predictions)`,
      data: {
        contractVersion: 'V2',
        totalPredictions: totalCountNumber - 1,
        syncedRange: { from: startId, to: totalCountNumber - 1 },
        syncedPredictions,
        syncedStakes,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 recent sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync recent V2 predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

