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

// GET /api/sync/v2/active - Sync only active predictions and their stakes
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting V2 active predictions sync...');

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

    let activePredictions = 0;
    let syncedStakes = 0;
    let errorsCount = 0;

    // Check all predictions to find active ones
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

        // Only process active predictions (not resolved, not cancelled, not expired)
        const deadline = Number(endTime);
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (resolved || cancelled || deadline <= currentTime) {
          continue;
        }

        console.log(`🔄 Syncing active V2 prediction ${i}: ${question.substring(0, 50)}...`);

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
          resolved: false,
          outcome: undefined,
          cancelled: false,
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
        activePredictions++;

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
        console.log(`✅ Synced active V2 prediction ${i}: ${question.substring(0, 50)}... (${stakesCount} stakes, participants: ${participants.length})`);

      } catch (error) {
        console.error(`❌ Failed to sync active V2 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 V2 active sync completed! Synced: ${activePredictions} active predictions, ${syncedStakes} stakes, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'V2 active predictions sync completed',
      data: {
        contractVersion: 'V2',
        activePredictions,
        syncedStakes,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 active sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync V2 active predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
