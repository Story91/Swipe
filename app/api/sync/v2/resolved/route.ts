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

// GET /api/sync/v2/resolved - Sync only resolved predictions and their stakes
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting V2 resolved predictions sync...');

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
    console.log(`📊 Found ${totalCountNumber} total predictions on V2 contract`);

    let resolvedPredictions = 0;
    let syncedStakes = 0;
    let errorsCount = 0;

    // Check all predictions to find resolved ones
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

        // Parse prediction data
        const [question, description, category, imageUrl, endTime, yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount, resolved, outcome, cancelled, creator, verified, needsApproval] = predictionData as any[];

        // Only process resolved predictions
        if (!resolved && !cancelled) {
          continue;
        }

        console.log(`🔄 Syncing resolved V2 prediction ${i}: ${question.substring(0, 50)}...`);

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
        const deadline = Number(endTime);
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

        // Validate deadline
        if (!deadline || deadline <= 0) {
          console.error(`❌ Invalid deadline for prediction ${i}: ${deadline}`);
          continue;
        }

        // Create safe date strings (deadline is in seconds, convert to milliseconds)
        const deadlineDate = new Date(deadline * 1000);
        const endDate = deadlineDate.toISOString().split('T')[0];
        const endTimeStr = deadlineDate.toISOString().split('T')[1].split('.')[0];

        // Create Redis prediction object
        const redisPrediction = {
          id: predictionId,
          question: question,
          description: description,
          category: category,
          imageUrl: imageUrl,
          deadline: deadline, // Deadline is already in seconds
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
          includeChart: false,
          endDate: endDate,
          endTime: endTimeStr,
          participants: participants.map(p => p.toLowerCase()),
          totalStakes: participants.length,
          createdAt: Math.floor(Date.now() / 1000),
          contractVersion: 'V2' as const
        };

        // Save prediction to Redis
        await redisHelpers.savePrediction(redisPrediction);
        resolvedPredictions++;

        // Sync user stakes for each participant
        let stakesCount = 0;
        for (const participant of participants) {
          try {
            // Get user stake data
            const userStakeData = await retryWithBackoff(async () => {
              return await publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userStakes',
                args: [BigInt(i), participant],
              });
            }) as any;

            // V2 returns struct with separate ETH and SWIPE stakes
            const ethYesAmount = userStakeData.ethYesAmount || 0;
            const ethNoAmount = userStakeData.ethNoAmount || 0;
            const swipeYesAmount = userStakeData.swipeYesAmount || 0;
            const swipeNoAmount = userStakeData.swipeNoAmount || 0;
            const ethClaimed = userStakeData.ethClaimed || false;
            const swipeClaimed = userStakeData.swipeClaimed || false;

            // Check if user won
            const ethWon = (resolvedBool && outcomeBool && ethYesAmount > 0) || 
                          (resolvedBool && !outcomeBool && ethNoAmount > 0) ||
                          cancelledBool;
            const swipeWon = (resolvedBool && outcomeBool && swipeYesAmount > 0) || 
                            (resolvedBool && !outcomeBool && swipeNoAmount > 0) ||
                            cancelledBool;

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
              console.log(`💰 Synced stake for user ${participant}: ETH won=${ethWon}, SWIPE won=${swipeWon}, ETH claimed=${ethClaimed}, SWIPE claimed=${swipeClaimed}`);
            }

          } catch (stakeError) {
            console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
          }
        }

        syncedStakes += stakesCount;
        console.log(`✅ Synced resolved V2 prediction ${i}: ${question.substring(0, 50)}... (${stakesCount} stakes, outcome: ${outcomeBool}, cancelled: ${cancelledBool})`);

      } catch (error) {
        console.error(`❌ Failed to sync resolved V2 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 V2 resolved sync completed! Synced: ${resolvedPredictions} resolved predictions, ${syncedStakes} stakes, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'V2 resolved predictions sync completed',
      data: {
        contractVersion: 'V2',
        resolvedPredictions,
        syncedStakes,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 resolved sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync V2 resolved predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
