import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { redisHelpers } from '../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// DELETE /api/sync - Clear all predictions from Redis  
export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ Clearing all predictions from Redis...');
    
    // Clear all predictions from Redis
    const allPredictions = await redisHelpers.getAllPredictions();
    let clearedKeys = 0;
    
    for (const prediction of allPredictions) {
      await redisHelpers.deletePrediction(prediction.id);
      clearedKeys++;
    }
    
    return NextResponse.json({
      success: true,
      message: 'All predictions cleared from Redis',
      clearedKeys: clearedKeys
    });
  } catch (error) {
    console.error('❌ Error clearing Redis:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clear Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET /api/sync - Sync all predictions from blockchain to Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting blockchain to Redis sync...');

    // Get total predictions count from contract
    const nextPredictionId = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'nextPredictionId',
    });

    const totalPredictions = Number(nextPredictionId) - 1; // nextPredictionId is the next available ID
    console.log(`📊 Found ${totalPredictions} predictions in smart contract`);

    let syncedCount = 0;
    let errorsCount = 0;
    let totalStakesSynced = 0;

    // Sync each prediction
    for (let i = 1; i <= totalPredictions; i++) {
      try {
        console.log(`🔄 Syncing prediction ${i}/${totalPredictions}...`);

        // Get prediction data using the correct function
        const predictionData = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'predictions',
          args: [BigInt(i)],
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

        // Get participants
        const participants = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'getParticipants',
          args: [BigInt(i)],
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

        // Create Redis prediction object
        const redisPrediction = {
          id: `pred_${i}`,
          question,
          description,
          category,
          imageUrl,
          includeChart: imageUrl.includes('geckoterminal.com'), // Check if it's a GeckoTerminal chart
          selectedCrypto: imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : '',
          endDate: new Date(Number(deadline)).toISOString().split('T')[0],
          endTime: new Date(Number(deadline)).toTimeString().slice(0, 5),
          deadline: Number(deadline),
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          resolved,
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
          }
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);
        
        // Sync user stakes for this prediction
        let stakesSynced = 0;
        for (const participant of participants) {
          try {
            // Get user's stake from blockchain
            const userStakeData = await publicClient.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
              functionName: 'userStakes',
              args: [BigInt(i), participant],
            }) as [bigint, bigint, boolean]; // [yesAmount, noAmount, claimed]

            const [yesAmount, noAmount, claimed] = userStakeData;
            
            // Only sync if user has stakes
            if (yesAmount > 0 || noAmount > 0) {
              const userStake = {
                userId: participant.toLowerCase(),
                predictionId: `pred_${i}`,
                yesAmount: Number(yesAmount),
                noAmount: Number(noAmount),
                claimed,
                stakedAt: Number(createdAt) // Use prediction creation time as fallback
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
        console.log(`✅ Synced prediction ${i}: ${question.substring(0, 50)}... (${stakesSynced} stakes)`);

      } catch (error) {
        console.error(`❌ Failed to sync prediction ${i}:`, error);
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
