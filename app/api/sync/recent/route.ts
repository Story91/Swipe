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

// GET /api/sync/recent - Sync only recent predictions (last 24 hours)
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting recent predictions sync...');

    // Get current time and 24 hours ago
    const now = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgo = now - (24 * 60 * 60);
    
    console.log(`📅 Syncing predictions from last 24 hours (since ${new Date(twentyFourHoursAgo * 1000).toISOString()})`);

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
    
    console.log(`📊 Found ${v1TotalPredictions} V1 predictions and ${v2TotalPredictions} V2 predictions`);

    let syncedCount = 0;
    let errorsCount = 0;
    let skippedCount = 0;

    // Sync recent V1 predictions
    for (let i = 1; i <= v1TotalPredictions; i++) {
      try {
        // Get prediction data to check creation time
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V1.address as `0x${string}`,
            abi: CONTRACTS.V1.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        }) as readonly any[];

        // Parse V1 data first to get createdAt
        const [
          question, description, category, imageUrl,
          yesTotalAmount, noTotalAmount, deadline, resolutionDeadline,
          resolved, outcome, cancelled, createdAt,
          creator, verified, approved, needsApproval
        ] = predictionData;

        const createdAtTimestamp = Number(createdAt);
        
        // Skip if prediction is older than 24 hours
        if (createdAtTimestamp < twentyFourHoursAgo) {
          skippedCount++;
          continue;
        }

        console.log(`🔄 Syncing recent V1 prediction ${i}/${v1TotalPredictions} (created: ${new Date(createdAtTimestamp * 1000).toISOString()})...`);

        // Get participants
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V1.address as `0x${string}`,
            abi: CONTRACTS.V1.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Calculate market stats
        const totalPool = yesTotalAmount + noTotalAmount;
        const yesPercentage = totalPool > BigInt(0) ? (yesTotalAmount * BigInt(100)) / totalPool : BigInt(0);
        const noPercentage = totalPool > BigInt(0) ? (noTotalAmount * BigInt(100)) / totalPool : BigInt(0);
        const timeLeft = deadline > BigInt(now) ? deadline - BigInt(now) : BigInt(0);

        // Get existing prediction from Redis to preserve chart data
        const existingPrediction = await redisHelpers.getPrediction(`pred_v1_${i}`);
        
        // Create Redis prediction object
        const redisPrediction = {
          id: `pred_v1_${i}`,
          question, description, category, imageUrl,
          includeChart: existingPrediction?.includeChart || imageUrl.includes('geckoterminal.com'),
          selectedCrypto: existingPrediction?.selectedCrypto || (imageUrl.includes('geckoterminal.com') ? imageUrl.split('/pools/')[1]?.split('?')[0] || '' : ''),
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
          contractVersion: 'V1' as const
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);
        
        syncedCount++;
        console.log(`✅ Synced recent V1 prediction ${i}: ${question.substring(0, 50)}... (created: ${new Date(createdAtTimestamp * 1000).toISOString()})`);

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Failed to sync V1 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Sync recent V2 predictions
    for (let i = 1; i <= v2TotalPredictions; i++) {
      try {
        // Get prediction data to check creation time
        const predictionData = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'predictions',
            args: [BigInt(i)],
          });
        }) as readonly any[];

        // Parse V2 data first to get createdAt
        const [
          question, description, category, imageUrl,
          yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount,
          deadline, resolutionDeadline, resolved, outcome, cancelled,
          createdAt, creator, verified, approved, needsApproval,
          creationToken, creationTokenAmount
        ] = predictionData;

        const createdAtTimestamp = Number(createdAt);
        
        // Skip if prediction is older than 24 hours
        if (createdAtTimestamp < twentyFourHoursAgo) {
          skippedCount++;
          continue;
        }

        console.log(`🔄 Syncing recent V2 prediction ${i}/${v2TotalPredictions} (created: ${new Date(createdAtTimestamp * 1000).toISOString()})...`);

        // Get participants
        const participants = await retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getParticipants',
            args: [BigInt(i)],
          });
        }) as readonly `0x${string}`[];

        // Calculate market stats
        const totalPool = yesTotalAmount + noTotalAmount + swipeYesTotalAmount + swipeNoTotalAmount;
        const yesPercentage = totalPool > BigInt(0) ? ((yesTotalAmount + swipeYesTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
        const noPercentage = totalPool > BigInt(0) ? ((noTotalAmount + swipeNoTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
        const timeLeft = deadline > BigInt(now) ? deadline - BigInt(now) : BigInt(0);

        // Get existing prediction from Redis to preserve chart data
        const existingPrediction = await redisHelpers.getPrediction(`pred_v2_${i}`);
        
        // Create Redis prediction object
        const redisPrediction = {
          id: `pred_v2_${i}`,
          question, description, category, imageUrl,
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
          contractVersion: 'V2' as const
        };

        // Save to Redis
        await redisHelpers.savePrediction(redisPrediction);
        
        syncedCount++;
        console.log(`✅ Synced recent V2 prediction ${i}: ${question.substring(0, 50)}... (created: ${new Date(createdAtTimestamp * 1000).toISOString()})`);

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Failed to sync V2 prediction ${i}:`, error);
        errorsCount++;
      }
    }

    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`🎉 Recent sync completed! Synced: ${syncedCount} recent predictions, Skipped: ${skippedCount} old predictions, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Recent predictions sync completed',
      data: {
        syncedCount,
        skippedCount,
        errorsCount,
        timeRange: '24 hours'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Recent sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync recent predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
