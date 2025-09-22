import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redisHelpers } from '../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/sync/recent-resolved - Sync recently resolved predictions from blockchain to Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Syncing recently resolved predictions from blockchain to Redis...');

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '168'); // Default: last 7 days (168 hours)
    const contractVersion = searchParams.get('version') || 'V2'; // Default: V2

    const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
    
    // Get total predictions count
    const totalPredictions = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'nextPredictionId',
      args: []
    }) as bigint;

    const totalCount = Number(totalPredictions);
    console.log(`📊 Found ${totalCount} total predictions on ${contractVersion} contract`);

    let syncedCount = 0;
    let errorsCount = 0;
    const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 60 * 60); // hours ago

    // Check recent predictions (last 5 to avoid too many calls)
    const startIndex = Math.max(1, totalCount - 5);
    
    console.log(`📊 Checking predictions ${startIndex} to ${totalCount} (last 5 predictions)`);
    console.log(`📊 Cutoff time: ${new Date(cutoffTime * 1000).toISOString()} (${hours} hours ago)`);
    
    for (let i = startIndex; i < totalCount; i++) { // Zmieniamy <= na < żeby nie sprawdzać nieistniejącej predykcji
      try {
        console.log(`🔍 Checking prediction ${i}...`);
        
        // Get prediction data from blockchain using both functions
        const predictionBasic = await publicClient.readContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'getPredictionBasic',
          args: [BigInt(i)],
        }) as any;
        
        let predictionExtended: any = {};
        try {
          predictionExtended = await publicClient.readContract({
            address: contract.address as `0x${string}`,
            abi: contract.abi,
            functionName: 'getPredictionExtended',
            args: [BigInt(i)],
          }) as any;
        } catch (extendedError) {
          console.error(`❌ Failed to get extended data for prediction ${i}:`, extendedError);
          predictionExtended = {};
        }
        
        console.log(`📋 Prediction ${i} Extended data:`, {
          imageUrl: predictionExtended.imageUrl,
          resolutionDeadline: predictionExtended.resolutionDeadline,
          cancelled: predictionExtended.cancelled,
          createdAt: predictionExtended.createdAt,
          verified: predictionExtended.verified,
          needsApproval: predictionExtended.needsApproval
        });
        
        // Combine both results
        const predictionData = {
          ...predictionBasic,
          imageUrl: predictionExtended.imageUrl,
          resolutionDeadline: predictionExtended.resolutionDeadline,
          cancelled: predictionExtended.cancelled,
          createdAt: predictionExtended.createdAt,
          verified: predictionExtended.verified,
          needsApproval: predictionExtended.needsApproval,
          approvalCount: predictionExtended.approvalCount_,
          // Add missing fields for V2
          swipeYesTotalAmount: 0,
          swipeNoTotalAmount: 0,
          creator: predictionBasic.creator
        };

        const predictionId = `pred_${contractVersion.toLowerCase()}_${i}`;
        
        console.log(`📋 Prediction ${i} data:`, {
          resolved: predictionData.resolved,
          outcome: predictionData.outcome,
          createdAt: predictionExtended.createdAt,
          question: predictionData.question?.substring(0, 50) + '...'
        });
        
        // Check if prediction is resolved (ignore createdAt for now since it's undefined)
        if (predictionData.resolved) {
          console.log(`🎯 Found resolved prediction ${i} (resolved: ${predictionData.resolved}, outcome: ${predictionData.outcome})`);
          
          // Get existing prediction from Redis
          let redisPrediction = await redisHelpers.getPrediction(predictionId);
          
          if (!redisPrediction) {
            // Create new prediction entry in Redis
            redisPrediction = {
              id: predictionId,
              question: predictionData.question || `Prediction ${i}`,
              description: predictionData.description || '',
              category: 'General',
              imageUrl: predictionData.imageUrl || '',
              includeChart: false,
              endDate: new Date(Number(predictionData.deadline) * 1000).toISOString().split('T')[0],
              endTime: new Date(Number(predictionData.deadline) * 1000).toTimeString().split(' ')[0],
              deadline: Number(predictionData.deadline),
              resolutionDeadline: Number(predictionData.resolutionDeadline || predictionData.deadline),
              yesTotalAmount: Number(predictionData.yesTotalAmount),
              noTotalAmount: Number(predictionData.noTotalAmount),
              swipeYesTotalAmount: Number(predictionData.swipeYesTotalAmount || 0),
              swipeNoTotalAmount: Number(predictionData.swipeNoTotalAmount || 0),
              resolved: true,
              outcome: predictionData.outcome,
              cancelled: false,
              createdAt: Number(predictionData.createdAt || predictionData.deadline - 86400),
              creator: predictionData.creator || '0x0000000000000000000000000000000000000000',
              verified: true,
              approved: true,
              needsApproval: false,
              participants: [],
              totalStakes: Number(predictionData.yesTotalAmount + predictionData.noTotalAmount + (predictionData.swipeYesTotalAmount || 0) + (predictionData.swipeNoTotalAmount || 0)),
              contractVersion: 'V2'
            };
            
            console.log(`📝 Creating new prediction in Redis: ${predictionId}`);
          } else {
            // Update existing prediction with all resolved data
            redisPrediction.resolved = true;
            redisPrediction.outcome = predictionData.outcome;
            redisPrediction.yesTotalAmount = Number(predictionData.yesTotalAmount);
            redisPrediction.noTotalAmount = Number(predictionData.noTotalAmount);
            redisPrediction.swipeYesTotalAmount = Number(predictionData.swipeYesTotalAmount || 0);
            redisPrediction.swipeNoTotalAmount = Number(predictionData.swipeNoTotalAmount || 0);
            redisPrediction.totalStakes = Number(predictionData.yesTotalAmount) + Number(predictionData.noTotalAmount) + Number(predictionData.swipeYesTotalAmount || 0) + Number(predictionData.swipeNoTotalAmount || 0);
            
            // Update all other fields from blockchain
            redisPrediction.question = predictionData.question || redisPrediction.question;
            redisPrediction.description = predictionData.description || redisPrediction.description;
            redisPrediction.category = predictionData.category || redisPrediction.category;
            redisPrediction.imageUrl = predictionData.imageUrl || redisPrediction.imageUrl;
            redisPrediction.deadline = Number(predictionData.deadline);
            redisPrediction.resolutionDeadline = Number(predictionData.resolutionDeadline || predictionData.deadline);
            redisPrediction.cancelled = predictionData.cancelled || false;
            redisPrediction.createdAt = Number(predictionData.createdAt || redisPrediction.createdAt);
            redisPrediction.creator = predictionData.creator || redisPrediction.creator;
            redisPrediction.verified = predictionData.verified !== undefined ? predictionData.verified : redisPrediction.verified;
            redisPrediction.approved = predictionData.approved !== undefined ? predictionData.approved : redisPrediction.approved;
            redisPrediction.needsApproval = predictionData.needsApproval !== undefined ? predictionData.needsApproval : redisPrediction.needsApproval;
            redisPrediction.contractVersion = 'V2';
            
            // Update market stats
            if (redisPrediction.marketStats) {
              redisPrediction.marketStats.totalPool = redisPrediction.totalStakes;
              redisPrediction.marketStats.timeLeft = 0; // Resolved predictions have no time left
              // Recalculate percentages
              const totalPool = redisPrediction.yesTotalAmount + redisPrediction.noTotalAmount;
              if (totalPool > 0) {
                redisPrediction.marketStats.yesPercentage = Math.round((redisPrediction.yesTotalAmount / totalPool) * 100);
                redisPrediction.marketStats.noPercentage = Math.round((redisPrediction.noTotalAmount / totalPool) * 100);
              }
            }
            
            console.log(`🔄 Updating existing prediction in Redis: ${predictionId}`);
          }
          
          // Save to Redis
          if (redisPrediction) {
            await redisHelpers.savePrediction(redisPrediction);
          }
          
          // Also sync user stakes for this prediction
          try {
            console.log(`🔄 Syncing user stakes for prediction ${i}...`);
            
            // Get participants from blockchain
            const participants = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'getParticipants',
              args: [BigInt(i)],
            }) as string[];

            for (const participant of participants) {
              try {
                // Get user stake from blockchain
                const userStakeData = await publicClient.readContract({
                  address: contract.address as `0x${string}`,
                  abi: contract.abi,
                  functionName: 'userStakes',
                  args: [BigInt(i), participant as `0x${string}`],
                }) as any;

                // Check if user won this prediction
                const userWon = (predictionData.outcome && userStakeData.yesAmount > 0) || 
                               (!predictionData.outcome && userStakeData.noAmount > 0);
                
                // Create/update user stake in Redis
                const userStake = {
                  user: participant,
                  predictionId: predictionId,
                  yesAmount: Number(userStakeData.yesAmount),
                  noAmount: Number(userStakeData.noAmount),
                  claimed: userStakeData.claimed || !userWon, // If user didn't win, mark as claimed (no reward)
                  tokenType: 'ETH' as const
                };
                
                console.log(`💰 User ${participant} stake: won=${userWon}, claimed=${userStake.claimed}, yesAmount=${userStake.yesAmount}, noAmount=${userStake.noAmount}`);

                await redisHelpers.saveUserStake(userStake);
                
              } catch (stakeError) {
                console.error(`❌ Failed to sync stake for participant ${participant}:`, stakeError);
              }
            }
            
          } catch (stakesError) {
            console.error(`❌ Failed to sync stakes for prediction ${i}:`, stakesError);
          }
          
          syncedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Failed to check prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    // Clear cache for all users who might be affected
    try {
      console.log(`🗑️ Clearing user cache after sync...`);
      // Note: In a real implementation, you might want to clear cache for specific users
      // For now, we'll just log that cache should be cleared
      console.log(`💡 Users should refresh their dashboard to see updated data`);
    } catch (cacheError) {
      console.error('❌ Failed to clear cache:', cacheError);
    }

    console.log(`🎉 Recent resolved sync completed! Synced: ${syncedCount} predictions, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Recently resolved predictions synced successfully',
      data: {
        contractVersion,
        hoursChecked: hours,
        predictionsChecked: totalCount - startIndex + 1,
        syncedCount,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Recent resolved sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync recently resolved predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
