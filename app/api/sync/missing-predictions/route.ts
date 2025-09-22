import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redisHelpers } from '../../../../lib/redis';
import { CONTRACTS } from '../../../../lib/contract';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/sync/missing-predictions - Sync predictions that exist on blockchain but not in Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Syncing missing predictions from blockchain to Redis...');

    // Get total prediction count from blockchain
    const totalCount = await publicClient.readContract({
      address: CONTRACTS.V2.address as `0x${string}`,
      abi: CONTRACTS.V2.abi,
      functionName: 'nextPredictionId',
    }) as bigint;

    const totalCountNumber = Number(totalCount);
    console.log(`📊 Found ${totalCountNumber} total predictions on V2 contract`);

    // Get all predictions from Redis
    const redisPredictions = await redisHelpers.getAllPredictions();
    const redisIds = new Set(redisPredictions.map(p => p.id));
    
    console.log(`📊 Found ${redisPredictions.length} predictions in Redis`);

    let syncedCount = 0;
    let errorsCount = 0;
    const missingPredictions = [];

    // Check all predictions to find missing ones
    for (let i = 1; i < totalCountNumber; i++) {
      try {
        const predictionId = `pred_v2_${i}`;
        
        // Skip if already exists in Redis
        if (redisIds.has(predictionId)) {
          continue;
        }

        console.log(`🔍 Checking missing prediction ${i}...`);

        // Get prediction data from blockchain
        const predictionData = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'getPredictionBasic',
          args: [BigInt(i)],
        }) as any;

        let predictionExtended;
        try {
          predictionExtended = await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getPredictionExtended',
            args: [BigInt(i)],
          }) as any;
        } catch (extendedError) {
          console.error(`❌ Failed to get extended data for prediction ${i}:`, extendedError);
          predictionExtended = {
            imageUrl: '',
            resolutionDeadline: 0,
            cancelled: false,
            createdAt: 0,
            verified: false,
            needsApproval: false
          };
        }

        console.log(`📋 Prediction ${i} data:`, {
          resolved: predictionData.resolved,
          outcome: predictionData.outcome,
          question: predictionData.question?.substring(0, 50) + '...'
        });

        console.log(`📋 Prediction ${i} extended data:`, {
          imageUrl: predictionExtended.imageUrl,
          resolutionDeadline: predictionExtended.resolutionDeadline,
          cancelled: predictionExtended.cancelled,
          createdAt: predictionExtended.createdAt,
          verified: predictionExtended.verified,
          needsApproval: predictionExtended.needsApproval
        });

        // Only sync if prediction exists and has data
        if (predictionData.question && predictionData.question.length > 0) {
          // Check if prediction already exists in Redis
          const existingPrediction = redisPredictions.find(p => p.id === predictionId);
          if (existingPrediction) {
            console.log(`⏭️ Skipping prediction ${i} - already exists in Redis`);
            continue;
          }
          
          missingPredictions.push({
            id: i,
            predictionId,
            data: predictionData,
            extended: predictionExtended
          });
          
          console.log(`✅ Found missing prediction ${i}: ${predictionData.question.substring(0, 50)}...`);
        }

      } catch (error) {
        console.error(`❌ Failed to check prediction ${i}:`, error);
        errorsCount++;
      }
    }

    console.log(`📊 Found ${missingPredictions.length} missing predictions`);

    // Sync missing predictions to Redis
    for (const missing of missingPredictions) {
      try {
        const { id, predictionId, data: predictionData, extended: predictionExtended } = missing;

        // Create new prediction in Redis
        const newPrediction = {
          id: predictionId,
          question: predictionData.question || '',
          description: predictionData.description || '',
          category: predictionData.category || 'General',
          imageUrl: predictionExtended.imageUrl || '',
          // Extended fields that don't exist in blockchain - set to defaults
          includeChart: false,
          selectedCrypto: '',
          endDate: '',
          endTime: '',
          deadline: Number(predictionData.deadline),
          resolutionDeadline: Number(predictionExtended.resolutionDeadline || predictionData.deadline),
          yesTotalAmount: Number(predictionData.yesTotalAmount),
          noTotalAmount: Number(predictionData.noTotalAmount),
          swipeYesTotalAmount: Number(predictionData.swipeYesTotalAmount || 0),
          swipeNoTotalAmount: Number(predictionData.swipeNoTotalAmount || 0),
          resolved: predictionData.resolved || false,
          outcome: predictionData.outcome || false,
          cancelled: predictionExtended.cancelled || false,
          createdAt: Number(predictionExtended.createdAt || Date.now() / 1000),
          creator: predictionData.creator || '',
          verified: predictionExtended.verified || false,
          approved: predictionExtended.approved || false,
          needsApproval: predictionExtended.needsApproval || false,
          participants: [],
          totalStakes: Number(predictionData.yesTotalAmount) + Number(predictionData.noTotalAmount) + Number(predictionData.swipeYesTotalAmount || 0) + Number(predictionData.swipeNoTotalAmount || 0),
          marketStats: {
            yesPercentage: 0,
            noPercentage: 0,
            timeLeft: 0,
            totalPool: 0
          },
          contractVersion: 'V2'
        };

        // Calculate market stats
        const totalPool = newPrediction.yesTotalAmount + newPrediction.noTotalAmount;
        if (totalPool > 0) {
          newPrediction.marketStats.yesPercentage = Math.round((newPrediction.yesTotalAmount / totalPool) * 100);
          newPrediction.marketStats.noPercentage = Math.round((newPrediction.noTotalAmount / totalPool) * 100);
        }
        newPrediction.marketStats.totalPool = newPrediction.totalStakes;

        // Calculate time left
        const now = Math.floor(Date.now() / 1000);
        if (newPrediction.resolved) {
          newPrediction.marketStats.timeLeft = 0;
        } else {
          newPrediction.marketStats.timeLeft = Math.max(0, newPrediction.deadline - now);
        }

        await redisHelpers.savePrediction(newPrediction);
        syncedCount++;

        console.log(`✅ Synced missing prediction ${predictionId} to Redis`);

        // If prediction is resolved, also sync user stakes
        if (predictionData.resolved) {
          try {
            // Get participants from blockchain
            const participants = await publicClient.readContract({
              address: CONTRACTS.V2.address as `0x${string}`,
              abi: CONTRACTS.V2.abi,
              functionName: 'getPredictionParticipants',
              args: [BigInt(id)],
            }) as string[];

            console.log(`👥 Found ${participants.length} participants for resolved prediction ${predictionId}`);

            // Sync user stakes for each participant
            for (const participant of participants) {
              try {
                const userStakeData = await publicClient.readContract({
                  address: CONTRACTS.V2.address as `0x${string}`,
                  abi: CONTRACTS.V2.abi,
                  functionName: 'userStakes',
                  args: [BigInt(id), participant as `0x${string}`],
                }) as any;

                const userWon = (predictionData.outcome && userStakeData.yesAmount > 0) || 
                               (!predictionData.outcome && userStakeData.noAmount > 0);

                const userStake = {
                  user: participant,
                  predictionId: predictionId,
                  yesAmount: Number(userStakeData.yesAmount),
                  noAmount: Number(userStakeData.noAmount),
                  claimed: userStakeData.claimed || !userWon,
                  tokenType: 'ETH' as const
                };

                await redisHelpers.saveUserStake(userStake);
                console.log(`💰 Synced stake for user ${participant}: won=${userWon}, claimed=${userStake.claimed}`);

              } catch (stakeError) {
                console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
              }
            }
          } catch (participantsError) {
            console.error(`❌ Failed to get participants for prediction ${predictionId}:`, participantsError);
          }
        }

      } catch (error) {
        console.error(`❌ Failed to sync missing prediction ${missing.predictionId}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 Missing predictions sync completed! Synced: ${syncedCount} predictions, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Missing predictions synced successfully',
      data: {
        syncedCount,
        errorsCount,
        totalChecked: totalCountNumber - 1,
        missingFound: missingPredictions.length
      }
    });

  } catch (error) {
    console.error('❌ Failed to sync missing predictions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync missing predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
