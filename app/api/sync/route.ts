import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS, getV1Contract, getV2Contract } from '../../../lib/contract';
import { redisHelpers } from '../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error?.message?.includes('rate limit') || error?.message?.includes('429')) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠️ Rate limit hit, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}


// GET /api/sync - Sync all predictions from blockchain to Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting dual contract blockchain to Redis sync...');

    // Get total predictions count from both contracts
    const [v1NextPredictionId, v2NextPredictionId] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.V1.address as `0x${string}`,
        abi: CONTRACTS.V1.abi,
        functionName: 'nextPredictionId',
        args: []
      }),
      publicClient.readContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
      functionName: 'nextPredictionId',
        args: []
      })
    ]);

    const v1TotalPredictions = Number(v1NextPredictionId) - 1;
    const v2TotalPredictions = Number(v2NextPredictionId) - 1;
    const totalPredictions = v1TotalPredictions + v2TotalPredictions;
    
    console.log(`📊 Found ${v1TotalPredictions} V1 predictions and ${v2TotalPredictions} V2 predictions`);

    let syncedCount = 0;
    let errorsCount = 0;
    let totalStakesSynced = 0;

    // Sync V1 predictions first
    for (let i = 1; i <= v1TotalPredictions; i++) {
      try {
        console.log(`🔄 Syncing V1 prediction ${i}/${v1TotalPredictions}...`);
        
        // Add delay between requests to avoid rate limits
        if (i > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

        // Get V1 prediction data
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V1.address as `0x${string}`,
            abi: CONTRACTS.V1.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        }) as [
          string, // question
          string, // description  
          string, // category
          string, // imageUrl
          bigint, // yesTotalAmount
          bigint, // noTotalAmount
          bigint, // deadline
          bigint, // resolutionDeadline
          boolean, // resolved
          boolean, // outcome
          boolean, // cancelled
          bigint, // createdAt
          string, // creator
          boolean, // verified
          boolean, // approved
          boolean  // needsApproval
        ];

        // Get V1 participants with retry logic
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V1.address as `0x${string}`,
            abi: CONTRACTS.V1.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Parse data
        const [
          question,
          description,
          category,
          imageUrl,
          yesTotalAmount,
          noTotalAmount,
          deadline,
          resolutionDeadline,
          resolved,
          outcome,
          cancelled,
          createdAt,
          creator,
          verified,
          approved,
          needsApproval
        ] = predictionData;

        // Calculate market stats from available data
        const totalPool = yesTotalAmount + noTotalAmount;
        const yesPercentage = totalPool > BigInt(0) ? (yesTotalAmount * BigInt(100)) / totalPool : BigInt(0);
        const noPercentage = totalPool > BigInt(0) ? (noTotalAmount * BigInt(100)) / totalPool : BigInt(0);
        const timeLeft = deadline > BigInt(Math.floor(Date.now() / 1000)) ? deadline - BigInt(Math.floor(Date.now() / 1000)) : BigInt(0);

        // Get existing prediction from Redis to preserve chart data
        const existingPrediction = await redisHelpers.getPrediction(`pred_v1_${i}`);
        
        // Create Redis prediction object
        const redisPrediction = {
          id: `pred_v1_${i}`,
          question,
          description,
          category,
          imageUrl,
          // Preserve existing chart data or detect from imageUrl
          includeChart: existingPrediction?.includeChart || imageUrl.includes('geckoterminal.com'),
          selectedCrypto: existingPrediction?.selectedCrypto || (imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : ''),
          endDate: new Date(Number(deadline) * 1000).toISOString().split('T')[0],
          endTime: new Date(Number(deadline) * 1000).toTimeString().slice(0, 5),
          deadline: Number(deadline),
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          swipeYesTotalAmount: 0, // V1 doesn't have SWIPE stakes
          swipeNoTotalAmount: 0, // V1 doesn't have SWIPE stakes
          resolved,
          outcome: resolved ? outcome : undefined, // Only set outcome if resolved
          cancelled,
          createdAt: Number(createdAt),
          creator,
          verified,
          approved,
          needsApproval,
          participants: participants.map(p => p.toLowerCase()), // Convert addresses to lowercase
          totalStakes: Number(totalPool),
          marketStats: {
            yesPercentage: Number(yesPercentage),
            noPercentage: Number(noPercentage),
            timeLeft: Number(timeLeft),
            totalPool: Number(totalPool)
          },
          contractVersion: 'V1' as const // Mark as V1
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);
        
        // Sync user stakes for this prediction
        let stakesSynced = 0;
        for (const participant of participants) {
          try {
            // Get user's stake from blockchain with retry logic
            const userStakeData = await retryWithBackoff(async () => {
              return await publicClient.readContract({
                address: CONTRACTS.V1.address as `0x${string}`,
                abi: CONTRACTS.V1.abi,
                functionName: 'userStakes',
                args: [BigInt(i), participant],
              });
            }) as [bigint, bigint, boolean]; // [yesAmount, noAmount, claimed]

            const [yesAmount, noAmount, claimed] = userStakeData;
            
            // Only sync if user has stakes
            if (yesAmount > 0 || noAmount > 0) {
              const userStake = {
                user: participant.toLowerCase(),
                predictionId: `pred_v1_${i}`,
                yesAmount: Number(yesAmount),
                noAmount: Number(noAmount),
                claimed,
                stakedAt: Number(createdAt), // Use prediction creation time as fallback
                contractVersion: 'V1' as const // Mark as V1
              };
              
              await redisHelpers.saveUserStake(userStake);
              stakesSynced++;
            }
          } catch (stakeError) {
            console.warn(`⚠️ Failed to sync stake for user ${participant} on prediction ${i}:`, stakeError);
          }
        }
        
        syncedCount++;
        totalStakesSynced += stakesSynced;
        console.log(`✅ Synced prediction ${i}: ${question.substring(0, 50)}... (${stakesSynced} stakes, resolved: ${resolved}, outcome: ${outcome}, participants: ${participants.length})`);

      } catch (error) {
        console.error(`❌ Failed to sync V1 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Sync V2 predictions
    for (let i = 1; i <= v2TotalPredictions; i++) {
      try {
        console.log(`🔄 Syncing V2 prediction ${i}/${v2TotalPredictions}...`);
        
        // Add delay between requests to avoid rate limits
        if (i > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

        // Get V2 prediction data
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        }) as [
          string, // question
          string, // description  
          string, // category
          string, // imageUrl
          bigint, // yesTotalAmount
          bigint, // noTotalAmount
          bigint, // swipeYesTotalAmount
          bigint, // swipeNoTotalAmount
          bigint, // deadline
          bigint, // resolutionDeadline
          boolean, // resolved
          boolean, // outcome
          boolean, // cancelled
          bigint, // createdAt
          string, // creator
          boolean, // verified
          boolean, // approved
          boolean, // needsApproval
          string, // creationToken
          bigint  // creationTokenAmount
        ];

        // Get V2 participants with retry logic
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Parse V2 data - correct order based on struct
        const [
          question,
          description,
          category,
          imageUrl,
          yesTotalAmount,
          noTotalAmount,
          swipeYesTotalAmount,
          swipeNoTotalAmount,
          deadline,
          resolutionDeadline,
          resolved,
          outcome,
          cancelled,
          createdAt,
          creator,
          verified,
          approved,
          needsApproval,
          creationToken,
          creationTokenAmount
        ] = predictionData;

        // Calculate market stats from available data
        const totalPool = yesTotalAmount + noTotalAmount + swipeYesTotalAmount + swipeNoTotalAmount;
        const yesPercentage = totalPool > BigInt(0) ? ((yesTotalAmount + swipeYesTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
        const noPercentage = totalPool > BigInt(0) ? ((noTotalAmount + swipeNoTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
        const timeLeft = deadline > BigInt(Math.floor(Date.now() / 1000)) ? deadline - BigInt(Math.floor(Date.now() / 1000)) : BigInt(0);

        // Get existing prediction from Redis to preserve chart data
        const existingPrediction = await redisHelpers.getPrediction(`pred_v2_${i}`);
        
        // Create Redis prediction object for V2
        const redisPrediction = {
          id: `pred_v2_${i}`,
          question,
          description,
          category,
          imageUrl,
          // Preserve existing chart data or detect from imageUrl
          includeChart: existingPrediction?.includeChart || imageUrl.includes('geckoterminal.com'),
          selectedCrypto: existingPrediction?.selectedCrypto || (imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : ''),
          endDate: new Date(Number(deadline) * 1000).toISOString().split('T')[0],
          endTime: new Date(Number(deadline) * 1000).toTimeString().slice(0, 5),
          deadline: Number(deadline),
          resolutionDeadline: Number(resolutionDeadline),
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          swipeYesTotalAmount: Number(swipeYesTotalAmount),
          swipeNoTotalAmount: Number(swipeNoTotalAmount),
          resolved,
          outcome: resolved ? outcome : undefined, // Only set outcome if resolved
          cancelled,
          createdAt: Number(createdAt),
          creator,
          verified,
          approved,
          needsApproval,
          participants: participants.map(p => p.toLowerCase()),
          totalStakes: Number(totalPool),
          marketStats: {
            yesPercentage: Number(yesPercentage),
            noPercentage: Number(noPercentage),
            timeLeft: Number(timeLeft),
            totalPool: Number(totalPool)
          },
          contractVersion: 'V2' as const // Mark as V2
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);

        // Sync stakes for this prediction
        let stakesSynced = 0;
        for (const participant of participants) {
          try {
            // Get ETH stakes
            const ethStakeData = await retryWithBackoff(async () => {
              return await publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userStakes',
                args: [BigInt(i), participant],
              });
            }) as any; // V2 returns struct {yesAmount, noAmount, claimed}

            // Get SWIPE stakes
            const swipeStakeData = await retryWithBackoff(async () => {
              return await publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userSwipeStakes',
                args: [BigInt(i), participant],
              });
            }) as any; // V2 returns struct {yesAmount, noAmount, claimed}

            const ethYesAmount = ethStakeData.yesAmount;
            const ethNoAmount = ethStakeData.noAmount;
            const ethClaimed = ethStakeData.claimed;
            const swipeYesAmount = swipeStakeData.yesAmount;
            const swipeNoAmount = swipeStakeData.noAmount;
            const swipeClaimed = swipeStakeData.claimed;

            // Collect all stakes for this user
            const userStakes: any = {
              predictionId: `pred_v2_${i}`,
              user: participant.toLowerCase(),
              stakedAt: Number(createdAt),
              contractVersion: 'V2' as const
            };

            // Add ETH stakes if any
            if (ethYesAmount > BigInt(0) || ethNoAmount > BigInt(0)) {
              userStakes.ETH = {
                yesAmount: Number(ethYesAmount),
                noAmount: Number(ethNoAmount),
                claimed: ethClaimed,
                tokenType: 'ETH' as const
              };
              stakesSynced++;
            }

            // Add SWIPE stakes if any
            if (swipeYesAmount > BigInt(0) || swipeNoAmount > BigInt(0)) {
              userStakes.SWIPE = {
                yesAmount: Number(swipeYesAmount),
                noAmount: Number(swipeNoAmount),
                claimed: swipeClaimed,
                tokenType: 'SWIPE' as const
              };
              stakesSynced++;
            }

            // Save combined stakes if any
            if (userStakes.ETH || userStakes.SWIPE) {
              await redisHelpers.saveUserStake(userStakes);
            }
          } catch (stakeError) {
            console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
          }
        }
        
        syncedCount++;
        totalStakesSynced += stakesSynced;
        console.log(`✅ Synced V2 prediction ${i}: ${question.substring(0, 50)}... (${stakesSynced} stakes, resolved: ${resolved}, outcome: ${outcome}, participants: ${participants.length})`);

      } catch (error) {
        console.error(`❌ Failed to sync V2 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 Sync completed! Synced: ${syncedCount} predictions, ${totalStakesSynced} stakes, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Blockchain to Redis sync completed',
      data: {
        totalPredictions,
        syncedCount,
        totalStakesSynced,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync blockchain data to Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
