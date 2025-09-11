import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../../lib/redis';
import { RedisUserStake } from '../../../../../lib/types/redis';

// GET /api/predictions/[id]/stakes - Get user stakes for a specific prediction
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const predictionId = params.id;

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    // Get all user stakes for this prediction
    const userStakes = await redisHelpers.getUserStakes(predictionId);

    // Transform stakes to include vote information
    const stakesWithVotes = userStakes.map(stake => {
      const hasYesStake = stake.yesAmount > 0;
      const hasNoStake = stake.noAmount > 0;
      
      // Determine user's vote based on which side has more stake
      let vote: 'YES' | 'NO' | 'BOTH' | 'NONE' = 'NONE';
      if (hasYesStake && hasNoStake) {
        vote = 'BOTH';
      } else if (hasYesStake) {
        vote = 'YES';
      } else if (hasNoStake) {
        vote = 'NO';
      }

      return {
        userId: stake.userId,
        predictionId: stake.predictionId,
        yesAmount: stake.yesAmount,
        noAmount: stake.noAmount,
        vote,
        totalStaked: stake.yesAmount + stake.noAmount,
        claimed: stake.claimed,
        stakedAt: stake.stakedAt
      };
    });

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
