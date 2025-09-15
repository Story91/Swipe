import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redisHelpers } from '../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// POST /api/blockchain/events - Handle blockchain events and auto-sync
export async function POST(request: NextRequest) {
  try {
    const { eventType, predictionId, contractVersion = 'V2' } = await request.json();
    
    console.log(`🔄 Handling blockchain event: ${eventType} for prediction ${predictionId} (${contractVersion})`);

    if (!predictionId) {
      return NextResponse.json({
        success: false,
        error: 'Prediction ID is required'
      }, { status: 400 });
    }

    const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
    const predictionKey = `pred_${contractVersion.toLowerCase()}_${predictionId}`;

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
