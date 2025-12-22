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
        // Get ETH stakes from blockchain
        const userStakeData = await publicClient.readContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'userStakes',
          args: [BigInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', '')), participant as `0x${string}`],
        }) as [bigint, bigint, boolean]; // [yesAmount, noAmount, claimed]

        const [ethYesAmount, ethNoAmount, ethClaimed] = userStakeData;
        
        // For V2, also get SWIPE stakes
        let swipeYesAmount = BigInt(0);
        let swipeNoAmount = BigInt(0);
        let swipeClaimed = false;
        
        if (isV2) {
          try {
            const swipeStakeData = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'userSwipeStakes',
              args: [BigInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', '')), participant as `0x${string}`],
            }) as [bigint, bigint, boolean];
            
            [swipeYesAmount, swipeNoAmount, swipeClaimed] = swipeStakeData;
          } catch (swipeError) {
            // V1 contracts don't have userSwipeStakes, ignore error
          }
        }
        
        // Combine ETH and SWIPE amounts for vote determination
        const totalYesAmount = ethYesAmount + swipeYesAmount;
        const totalNoAmount = ethNoAmount + swipeNoAmount;
        
        // Only include if user has any stakes (ETH or SWIPE)
        if (totalYesAmount > 0 || totalNoAmount > 0) {
          const hasYesStake = totalYesAmount > 0;
          const hasNoStake = totalNoAmount > 0;
          
          // Determine user's vote based on which side they staked on
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
            // ETH amounts (in wei)
            yesAmount: Number(ethYesAmount),
            noAmount: Number(ethNoAmount),
            // SWIPE amounts (in wei)
            swipeYesAmount: Number(swipeYesAmount),
            swipeNoAmount: Number(swipeNoAmount),
            vote,
            totalStaked: Number(ethYesAmount) + Number(ethNoAmount),
            totalSwipeStaked: Number(swipeYesAmount) + Number(swipeNoAmount),
            claimed: ethClaimed || swipeClaimed,
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
