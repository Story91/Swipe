import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redisHelpers, redis } from '../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// POST /api/blockchain/events - Handle blockchain events and auto-sync
export async function POST(request: NextRequest) {
  try {
    const { eventType, predictionId, contractVersion = 'V2', userId, txHash } = await request.json();
    
    console.log(`🔄 Handling blockchain event: ${eventType} for prediction ${predictionId} (${contractVersion})`);

    if (!predictionId) {
      return NextResponse.json({
        success: false,
        error: 'Prediction ID is required'
      }, { status: 400 });
    }

    // All predictions use V2 contract (pred_v1_ are synced V1 predictions on V2)
    const contract = CONTRACTS.V2;
    const predictionKey = `pred_${contractVersion.toLowerCase()}_${predictionId}`;

    // Handle stake_placed and reward_claimed events - sync stakes data
    if (eventType === 'stake_placed' || eventType === 'reward_claimed') {
      console.log(`💰 Syncing stakes data after ${eventType} for prediction ${predictionId}`);
      
      try {
        // Get participants from prediction
        const participants = await publicClient.readContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'getParticipants',
          args: [BigInt(predictionId)],
        }) as string[];

        let stakesUpdated = 0;

        // Update stakes for each participant
        for (const participant of participants) {
          try {
            // V2 - get separate ETH and SWIPE stakes (all predictions use V2)
            const [userStakeData, userSwipeStakeData] = await Promise.all([
              publicClient.readContract({
                address: contract.address as `0x${string}`,
                abi: contract.abi,
                functionName: 'userStakes',
                args: [BigInt(predictionId), participant as `0x${string}`],
              }) as any,
              publicClient.readContract({
                address: contract.address as `0x${string}`,
                abi: contract.abi,
                functionName: 'userSwipeStakes',
                args: [BigInt(predictionId), participant as `0x${string}`],
              }) as any
            ]);

            const stakeKey = `user_stakes:${participant.toLowerCase()}:${predictionKey}`;
            
            // V2 format - multi-token stake (all predictions use V2)
            const ethYesAmount = userStakeData.ethYesAmount || 0;
            const ethNoAmount = userStakeData.ethNoAmount || 0;
            const swipeYesAmount = userSwipeStakeData.swipeYesAmount || 0;
            const swipeNoAmount = userSwipeStakeData.swipeNoAmount || 0;
            const ethClaimed = userStakeData.ethClaimed || false;
            const swipeClaimed = userSwipeStakeData.swipeClaimed || false;

            const stakeData: any = {
              user: participant.toLowerCase(),
              predictionId: predictionKey,
              stakedAt: Math.floor(Date.now() / 1000),
              contractVersion: 'V2'
            };

            // Add ETH stakes if any
            if (ethYesAmount > 0 || ethNoAmount > 0) {
              stakeData.ETH = {
                yesAmount: Number(ethYesAmount),
                noAmount: Number(ethNoAmount),
                claimed: ethClaimed,
                tokenType: 'ETH'
              };
            }

            // Add SWIPE stakes if any
            if (swipeYesAmount > 0 || swipeNoAmount > 0) {
              stakeData.SWIPE = {
                yesAmount: Number(swipeYesAmount),
                noAmount: Number(swipeNoAmount),
                claimed: swipeClaimed,
                tokenType: 'SWIPE'
              };
            }

            // Save stake data to Redis (only if user has any stakes)
            if (stakeData.ETH || stakeData.SWIPE) {
              await redis.set(stakeKey, JSON.stringify(stakeData));
              stakesUpdated++;
              console.log(`✅ Updated V2 stake for user ${participant} in prediction ${predictionId} - ETH: ${ethClaimed}, SWIPE: ${swipeClaimed}`);
              
              // Save transaction to user's history if this is a new stake (eventType === 'stake_placed')
              if (eventType === 'stake_placed' && userId && participant.toLowerCase() === userId.toLowerCase()) {
                try {
                  // Get prediction data for transaction record
                  const predictionData = await redis.get(`prediction:${predictionKey}`);
                  let predictionQuestion = `Prediction #${predictionId}`;
                  if (predictionData) {
                    const prediction = typeof predictionData === 'string' ? JSON.parse(predictionData) : predictionData;
                    predictionQuestion = prediction.question || predictionQuestion;
                  }
                  
                  // Create transaction record
                  const transaction = {
                    id: `stake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'stake',
                    predictionId: predictionKey,
                    predictionQuestion,
                    txHash: txHash || 'unknown',
                    basescanUrl: txHash ? `https://basescan.org/tx/${txHash}` : undefined,
                    timestamp: Date.now(),
                    status: 'success',
                    amount: Number(ethYesAmount + ethNoAmount + swipeYesAmount + swipeNoAmount),
                    tokenType: (ethYesAmount > 0 || ethNoAmount > 0) ? 'ETH' : 'SWIPE'
                  };
                  
                  // Save to user transactions
                  const userTxKey = `user_transactions:${participant.toLowerCase()}`;
                  const existingTxs = await redis.get(userTxKey);
                  let transactions = existingTxs ? (typeof existingTxs === 'string' ? JSON.parse(existingTxs) : existingTxs) : [];
                  
                  // Add new transaction to beginning of array
                  transactions = [transaction, ...transactions].slice(0, 100); // Keep last 100
                  
                  await redis.set(userTxKey, JSON.stringify(transactions));
                  console.log(`✅ Saved stake transaction to user history: ${participant}`);
                } catch (txError) {
                  console.error(`⚠️ Failed to save transaction to user history:`, txError);
                  // Don't fail the whole sync if transaction save fails
                }
              }
            }
          } catch (stakeError) {
            console.error(`❌ Failed to update stake for user ${participant}:`, stakeError);
          }
        }

        return NextResponse.json({
          success: true,
          message: `Stakes synced after ${eventType} for prediction ${predictionId}`,
          data: {
            predictionId,
            eventType,
            contractVersion,
            stakesUpdated
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ Failed to sync stakes after ${eventType}:`, error);
        return NextResponse.json({
          success: false,
          error: `Failed to sync stakes after ${eventType}`
        }, { status: 500 });
      }
    }

    // Get current prediction data from blockchain
    const predictionData = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'predictions',
      args: [BigInt(predictionId)],
    });

    // Get participants
    const participants = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'getParticipants',
      args: [BigInt(predictionId)],
    }) as readonly `0x${string}`[];

    // Parse data based on contract version
    let redisPrediction: any;
    
    if (contractVersion === 'V1') {
      const [
        question, description, category, imageUrl,
        yesTotalAmount, noTotalAmount, deadline, resolutionDeadline,
        resolved, outcome, cancelled, createdAt, creator,
        verified, approved, needsApproval
      ] = predictionData as any[];

      const totalPool = yesTotalAmount + noTotalAmount;
      const yesPercentage = totalPool > BigInt(0) ? (yesTotalAmount * BigInt(100)) / totalPool : BigInt(0);
      const noPercentage = totalPool > BigInt(0) ? (noTotalAmount * BigInt(100)) / totalPool : BigInt(0);
      const timeLeft = deadline > BigInt(Math.floor(Date.now() / 1000)) ? deadline - BigInt(Math.floor(Date.now() / 1000)) : BigInt(0);

      redisPrediction = {
        id: predictionKey,
        question, description, category, imageUrl,
        includeChart: imageUrl.includes('geckoterminal.com'),
        selectedCrypto: imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : '',
        endDate: new Date(Number(deadline) * 1000).toISOString().split('T')[0],
        endTime: new Date(Number(deadline) * 1000).toTimeString().slice(0, 5),
        deadline: Number(deadline),
        yesTotalAmount: Number(yesTotalAmount),
        noTotalAmount: Number(noTotalAmount),
        swipeYesTotalAmount: 0,
        swipeNoTotalAmount: 0,
        resolved, outcome: resolved ? outcome : undefined, cancelled,
        createdAt: Number(createdAt), creator, verified, approved, needsApproval,
        participants: participants.map(p => p.toLowerCase()),
        totalStakes: Number(totalPool),
        marketStats: {
          yesPercentage: Number(yesPercentage),
          noPercentage: Number(noPercentage),
          timeLeft: Number(timeLeft),
          totalPool: Number(totalPool)
        },
        contractVersion: 'V1'
      };
    } else {
      const [
        question, description, category, imageUrl,
        yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount,
        deadline, resolutionDeadline, resolved, outcome, cancelled,
        createdAt, creator, verified, approved, needsApproval,
        creationToken, creationTokenAmount
      ] = predictionData as any[];

      const totalPool = yesTotalAmount + noTotalAmount + swipeYesTotalAmount + swipeNoTotalAmount;
      const yesPercentage = totalPool > BigInt(0) ? ((yesTotalAmount + swipeYesTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
      const noPercentage = totalPool > BigInt(0) ? ((noTotalAmount + swipeNoTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
      const timeLeft = deadline > BigInt(Math.floor(Date.now() / 1000)) ? deadline - BigInt(Math.floor(Date.now() / 1000)) : BigInt(0);

      redisPrediction = {
        id: predictionKey,
        question, description, category, imageUrl,
        includeChart: imageUrl.includes('geckoterminal.com'),
        selectedCrypto: imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : '',
        endDate: new Date(Number(deadline) * 1000).toISOString().split('T')[0],
        endTime: new Date(Number(deadline) * 1000).toTimeString().slice(0, 5),
        deadline: Number(deadline),
        resolutionDeadline: Number(resolutionDeadline),
        yesTotalAmount: Number(yesTotalAmount),
        noTotalAmount: Number(noTotalAmount),
        swipeYesTotalAmount: Number(swipeYesTotalAmount),
        swipeNoTotalAmount: Number(swipeNoTotalAmount),
        resolved, outcome: resolved ? outcome : undefined, cancelled,
        createdAt: Number(createdAt), creator, verified, approved, needsApproval,
        participants: participants.map(p => p.toLowerCase()),
        totalStakes: Number(totalPool),
        marketStats: {
          yesPercentage: Number(yesPercentage),
          noPercentage: Number(noPercentage),
          timeLeft: Number(timeLeft),
          totalPool: Number(totalPool)
        },
        contractVersion: 'V2'
      };
    }

    // Save to Redis
    await redisHelpers.savePrediction(redisPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`✅ Event ${eventType} handled for prediction ${predictionId}: ${redisPrediction.question.substring(0, 50)}...`);

    return NextResponse.json({
      success: true,
      message: `Prediction ${predictionId} synced after ${eventType}`,
      data: {
        predictionId,
        eventType,
        contractVersion,
        totalStakes: redisPrediction.totalStakes,
        participants: participants.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to handle blockchain event:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to handle blockchain event',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
