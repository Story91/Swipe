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
      if (error?.message?.includes('rate limit') || error?.message?.includes('429')) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠️ Rate limit hit, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// GET /api/sync/active - Sync only active predictions (much faster)
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting active predictions sync...');

    // Get current active predictions from Redis to know which ones to update
    const existingActivePredictions = await redisHelpers.getActivePredictions();
    console.log(`📊 Found ${existingActivePredictions.length} active predictions in Redis`);

    let syncedCount = 0;
    let errorsCount = 0;
    let totalStakesSynced = 0;

    // Sync each active prediction
    for (const existingPred of existingActivePredictions) {
      try {
        const predictionId = existingPred.id.replace(/^pred_(v1|v2)_/, '');
        const contractVersion = existingPred.contractVersion;
        const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;

        console.log(`🔄 Syncing ${contractVersion} prediction ${predictionId}...`);

        // Get current data from blockchain
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: contract.address as `0x${string}`,
            abi: contract.abi,
            functionName: 'predictions',
            args: [BigInt(predictionId)],
          });
        });

        // Get participants
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: contract.address as `0x${string}`,
            abi: contract.abi,
            functionName: 'getParticipants',
            args: [BigInt(predictionId)],
          });
        }) as readonly `0x${string}`[];

        // Parse and update data
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
            ...existingPred, // Preserve existing data like chart settings
            question, description, category, imageUrl,
            deadline: Number(deadline),
            yesTotalAmount: Number(yesTotalAmount),
            noTotalAmount: Number(noTotalAmount),
            resolved, outcome: resolved ? outcome : undefined, cancelled,
            participants: participants.map(p => p.toLowerCase()),
            totalStakes: Number(totalPool),
            marketStats: {
              yesPercentage: Number(yesPercentage),
              noPercentage: Number(noPercentage),
              timeLeft: Number(timeLeft),
              totalPool: Number(totalPool)
            }
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
            ...existingPred, // Preserve existing data like chart settings
            question, description, category, imageUrl,
            deadline: Number(deadline),
            resolutionDeadline: Number(resolutionDeadline),
            yesTotalAmount: Number(yesTotalAmount),
            noTotalAmount: Number(noTotalAmount),
            swipeYesTotalAmount: Number(swipeYesTotalAmount),
            swipeNoTotalAmount: Number(swipeNoTotalAmount),
            resolved, outcome: resolved ? outcome : undefined, cancelled,
            participants: participants.map(p => p.toLowerCase()),
            totalStakes: Number(totalPool),
            marketStats: {
              yesPercentage: Number(yesPercentage),
              noPercentage: Number(noPercentage),
              timeLeft: Number(timeLeft),
              totalPool: Number(totalPool)
            }
          };
        }

        // Save updated prediction to Redis
        await redisHelpers.savePrediction(redisPrediction);
        
        syncedCount++;
        console.log(`✅ Synced ${contractVersion} prediction ${predictionId}: ${redisPrediction.question.substring(0, 50)}... (participants: ${participants.length})`);

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Failed to sync prediction ${existingPred.id}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 Active sync completed! Synced: ${syncedCount} predictions, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Active predictions sync completed',
      data: {
        activePredictions: existingActivePredictions.length,
        syncedCount,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Active sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync active predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
