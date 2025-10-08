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

// POST /api/sync/v2/active-stakes - Sync only stakes data for active predictions
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting active predictions stakes sync...');
    
    // Get all predictions from Redis first
    const allPredictions = await redisHelpers.getAllPredictions();
    
    // Filter only active predictions (not resolved, not cancelled)
    const activePredictions = allPredictions.filter(p => 
      !p.resolved && !p.cancelled && p.contractVersion === 'V2'
    );
    
    console.log(`📊 Found ${activePredictions.length} active predictions to sync stakes for`);
    
    let syncedCount = 0;
    let errorsCount = 0;
    
    // Sync stakes for each active prediction
    for (const prediction of activePredictions) {
      try {
        // Extract numeric ID from prediction ID
        const numericId = parseInt(prediction.id.replace('pred_v2_', ''));
        
        if (isNaN(numericId)) {
          console.warn(`⚠️ Invalid prediction ID: ${prediction.id}`);
          continue;
        }
        
        // Get prediction data from blockchain
        const predictionData = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'predictions',
          args: [BigInt(numericId)],
        }) as any[];
        
        if (!predictionData || predictionData.length === 0) {
          console.warn(`⚠️ No blockchain data for prediction ${numericId}`);
          continue;
        }
        
        // Extract only stakes data (positions 4-7 in the array)
        const [
          , , , , // question, description, category, imageUrl
          yesTotalAmount,
          noTotalAmount,
          swipeYesTotalAmount,
          swipeNoTotalAmount,
          , , , , , , , , , // deadline, resolutionDeadline, resolved, outcome, cancelled, createdAt, creator, verified, approved, needsApproval, creationToken, creationTokenAmount
        ] = predictionData;
        
        // Get participants count
        let participants: string[] = [];
        try {
          participants = await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(numericId)],
          }) as string[];
        } catch (error) {
          console.warn(`⚠️ Could not fetch participants for prediction ${numericId}:`, error);
        }
        
        // Update only stakes data in Redis prediction
        const updatedPrediction = {
          ...prediction,
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          swipeYesTotalAmount: Number(swipeYesTotalAmount),
          swipeNoTotalAmount: Number(swipeNoTotalAmount),
          participants: participants.map(p => String(p).toLowerCase()),
          totalStakes: participants.length,
        };
        
        // Save updated prediction to Redis
        await redisHelpers.savePrediction(updatedPrediction);
        
        console.log(`✅ Synced stakes for prediction ${numericId}:`, {
          question: prediction.question.substring(0, 30) + '...',
          yesETH: `${(Number(yesTotalAmount) / 1e18).toFixed(5)} ETH`,
          noETH: `${(Number(noTotalAmount) / 1e18).toFixed(5)} ETH`,
          yesSWIPE: `${(Number(swipeYesTotalAmount) / 1e18).toFixed(0)} SWIPE`,
          noSWIPE: `${(Number(swipeNoTotalAmount) / 1e18).toFixed(0)} SWIPE`,
          participants: participants.length
        });
        
        syncedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to sync stakes for prediction ${prediction.id}:`, error);
        errorsCount++;
      }
    }
    
    console.log(`✅ Active stakes sync completed: ${syncedCount} synced, ${errorsCount} errors`);
    
    return NextResponse.json({
      success: true,
      message: 'Active predictions stakes sync completed',
      data: {
        totalActivePredictions: activePredictions.length,
        syncedPredictions: syncedCount,
        errorsCount: errorsCount,
        contractVersion: 'V2'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to sync active predictions stakes:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to sync active predictions stakes: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}
