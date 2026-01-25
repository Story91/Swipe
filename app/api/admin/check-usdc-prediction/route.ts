import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '../../../../lib/redis';

/**
 * GET /api/admin/check-usdc-prediction?predictionId=227
 * Diagnostic endpoint to check USDC prediction data and participants
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionIdParam = searchParams.get('predictionId');

    if (!predictionIdParam) {
      return NextResponse.json(
        {
          success: false,
          error: 'predictionId is required',
        },
        { status: 400 }
      );
    }

    const numericId = parseInt(predictionIdParam, 10);
    if (isNaN(numericId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid predictionId',
        },
        { status: 400 }
      );
    }

    const redisId = `pred_v2_${numericId}`;
    
    // Get prediction data
    const predData = await redis.get(REDIS_KEYS.PREDICTION(redisId));
    if (!predData) {
      return NextResponse.json({
        success: false,
        error: 'Prediction not found in Redis',
        predictionId: numericId,
        redisId
      });
    }

    const prediction = typeof predData === 'string' ? JSON.parse(predData) : predData;
    const predAny = prediction as any;

    // Get USDC participants from prediction
    const usdcParticipants = predAny.usdcParticipants || [];
    
    // Get all stakes for this prediction
    const stakePattern = `user_stakes:*:${redisId}`;
    const allStakeKeys = await redis.keys(stakePattern);
    
    const usdcStakes: any[] = [];
    const allStakes: any[] = [];

    for (const stakeKey of allStakeKeys) {
      const stakeData = await redis.get(stakeKey);
      if (stakeData) {
        const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
        allStakes.push({
          user: stake.user,
          hasETH: !!(stake.ETH || stake.yesAmount || stake.noAmount),
          hasSWIPE: !!stake.SWIPE,
          hasUSDC: !!stake.USDC,
          usdcStake: stake.USDC ? {
            yesAmount: stake.USDC.yesAmount,
            noAmount: stake.USDC.noAmount,
            claimed: stake.USDC.claimed
          } : null
        });

        if (stake.USDC) {
          usdcStakes.push({
            user: stake.user,
            yesAmount: stake.USDC.yesAmount,
            noAmount: stake.USDC.noAmount,
            claimed: stake.USDC.claimed,
            entryPrice: stake.USDC.entryPrice,
            exitedEarly: stake.USDC.exitedEarly
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      predictionId: numericId,
      redisId,
      prediction: {
        id: prediction.id,
        usdcPoolEnabled: predAny.usdcPoolEnabled || false,
        usdcResolved: predAny.usdcResolved || false,
        usdcCancelled: predAny.usdcCancelled || false,
        usdcOutcome: predAny.usdcOutcome ?? null,
        usdcParticipantCount: predAny.usdcParticipantCount || 0,
        usdcYesTotalAmount: predAny.usdcYesTotalAmount || 0,
        usdcNoTotalAmount: predAny.usdcNoTotalAmount || 0,
        // Also check regular prediction status
        resolved: prediction.resolved || false,
        cancelled: prediction.cancelled || false,
        outcome: prediction.outcome ?? null
      },
      usdcParticipants: usdcParticipants.map((p: string) => p.toLowerCase()),
      usdcStakesCount: usdcStakes.length,
      usdcStakes: usdcStakes,
      allStakesCount: allStakes.length,
      allStakes: allStakes.slice(0, 20), // Limit to first 20
      diagnostic: {
        participantsInList: usdcParticipants.length,
        stakesInRedis: usdcStakes.length,
        missingStakes: usdcParticipants.filter((p: string) => 
          !usdcStakes.some(s => s.user.toLowerCase() === p.toLowerCase())
        ).map((p: string) => p.toLowerCase())
      }
    });

  } catch (error) {
    console.error('❌ Failed to check USDC prediction:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check USDC prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
