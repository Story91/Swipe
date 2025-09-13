import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../../lib/redis';
import { RedisUserStake } from '../../../../../lib/types/redis';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../../lib/contract';

// GET /api/predictions/[id]/stakes - Get user stakes for a specific prediction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {    const { id: predictionId } = await params;

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    // Initialize public client for Base network
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    // Get prediction data to determine contract version
    const prediction = await redisHelpers.getPrediction(predictionId);
    if (!prediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }

    // Determine which contract to use
    const isV2 = prediction.contractVersion === 'V2' || predictionId.startsWith('pred_v2_');
    const contract = isV2 ? CONTRACTS.V2 : CONTRACTS.V1;

    // Get participants from prediction
    const participants = prediction.participants || [];
    
    // Get stakes directly from blockchain for each participant
    const stakesWithVotes = [];
    
    for (const participant of participants) {
      try {
        // Get user stakes from blockchain
        const userStakeData = await publicClient.readContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'userStakes',
          args: [BigInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', '')), participant as `0x${string}`],
        }) as [bigint, bigint, boolean]; // [yesAmount, noAmount, claimed]

        const [yesAmount, noAmount, claimed] = userStakeData;
        
        // Only include if user has stakes
        if (yesAmount > 0 || noAmount > 0) {
          const hasYesStake = yesAmount > 0;
          const hasNoStake = noAmount > 0;
          
          // Determine user's vote based on which side has more stake
          let vote: 'YES' | 'NO' | 'BOTH' | 'NONE' = 'NONE';
          if (hasYesStake && hasNoStake) {
            vote = 'BOTH';
          } else if (hasYesStake) {
            vote = 'YES';
          } else if (hasNoStake) {
            vote = 'NO';
          }

          stakesWithVotes.push({
            userId: participant.toLowerCase(),
            predictionId: predictionId,
            yesAmount: Number(yesAmount),
            noAmount: Number(noAmount),
            vote,
            totalStaked: Number(yesAmount) + Number(noAmount),
            claimed,
            stakedAt: prediction.createdAt
          });
        }
      } catch (error) {
        console.warn(`Failed to get stakes for user ${participant}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        predictionId,
        stakes: stakesWithVotes,
        totalStakes: stakesWithVotes.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get prediction stakes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prediction stakes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
