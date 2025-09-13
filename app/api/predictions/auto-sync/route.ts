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

// POST /api/predictions/auto-sync - Automatically sync the latest prediction after creation
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Auto-syncing latest V2 prediction after creation...');
    
    // Get the current nextPredictionId to find the latest prediction
    const nextId = await publicClient.readContract({
      address: CONTRACTS.V2.address as `0x${string}`,
      abi: CONTRACTS.V2.abi,
      functionName: 'nextPredictionId',
      args: []
    });

    const latestPredictionId = Number(nextId) - 1;
    
    if (latestPredictionId <= 0) {
      return NextResponse.json({
        success: false,
        error: 'No predictions found to sync'
      }, { status: 404 });
    }

    console.log(`📊 Latest prediction ID: ${latestPredictionId}`);

    // Get the latest prediction data from V2 contract
    const predictionData = await publicClient.readContract({
      address: CONTRACTS.V2.address as `0x${string}`,
      abi: CONTRACTS.V2.abi,
      functionName: 'predictions',
      args: [BigInt(latestPredictionId)],
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

    // Parse V2 data according to contract struct
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

    // Get participants (though it might be empty for new predictions)
    const participants = await publicClient.readContract({
      address: CONTRACTS.V2.address as `0x${string}`,
      abi: CONTRACTS.V2.abi,
      functionName: 'getParticipants',
      args: [BigInt(latestPredictionId)],
    }) as readonly `0x${string}`[];

    // Calculate market stats
    const totalPool = yesTotalAmount + noTotalAmount + swipeYesTotalAmount + swipeNoTotalAmount;
    const yesPercentage = totalPool > BigInt(0) ? ((yesTotalAmount + swipeYesTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
    const noPercentage = totalPool > BigInt(0) ? ((noTotalAmount + swipeNoTotalAmount) * BigInt(100)) / totalPool : BigInt(0);
    const timeLeft = deadline > BigInt(Math.floor(Date.now() / 1000)) ? deadline - BigInt(Math.floor(Date.now() / 1000)) : BigInt(0);

    // Create Redis prediction object
    const redisPrediction = {
      id: `pred_v2_${latestPredictionId}`,
      question,
      description,
      category,
      imageUrl,
      // Auto-detect chart from imageUrl
      includeChart: imageUrl.includes('geckoterminal.com'),
      selectedCrypto: imageUrl.includes('geckoterminal.com') ? 
        imageUrl.split('/pools/')[1]?.split('?')[0] || '' : '',
      endDate: new Date(Number(deadline) * 1000).toISOString().split('T')[0],
      endTime: new Date(Number(deadline) * 1000).toTimeString().slice(0, 5),
      deadline: Number(deadline),
      resolutionDeadline: Number(resolutionDeadline),
      yesTotalAmount: Number(yesTotalAmount),
      noTotalAmount: Number(noTotalAmount),
      swipeYesTotalAmount: Number(swipeYesTotalAmount),
      swipeNoTotalAmount: Number(swipeNoTotalAmount),
      resolved,
      outcome: resolved ? outcome : undefined,
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
      contractVersion: 'V2' as const
    };

    // Save to Redis
    await redisHelpers.savePrediction(redisPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();

    console.log(`✅ Auto-synced prediction ${latestPredictionId} to Redis: ${question.substring(0, 50)}...`);

    return NextResponse.json({
      success: true,
      message: `Prediction ${latestPredictionId} auto-synced successfully`,
      data: {
        predictionId: latestPredictionId,
        question: question.substring(0, 100),
        category,
        creator,
        totalPool: Number(totalPool),
        participants: participants.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Auto-sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to auto-sync prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
