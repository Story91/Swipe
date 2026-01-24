import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';

// GET /api/debug/usdc-redis?predictionId=225
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionIdParam = searchParams.get('predictionId');
    
    if (!predictionIdParam) {
      return NextResponse.json(
        { success: false, error: 'predictionId required' },
        { status: 400 }
      );
    }
    
    const predictionId = parseInt(predictionIdParam, 10);
    if (isNaN(predictionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid predictionId' },
        { status: 400 }
      );
    }
    
    const redisId = `pred_v2_${predictionId}`;
    const predData = await redis.get(REDIS_KEYS.PREDICTION(redisId));
    
    if (!predData) {
      return NextResponse.json({
        success: false,
        error: 'Prediction not found in Redis',
        redisId
      });
    }
    
    const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;
    
    // Check user stake in Redis
    const userAddress = '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd'.toLowerCase();
    const stakeKey = REDIS_KEYS.USER_STAKE(userAddress, redisId);
    const stakeData = await redis.get(stakeKey);
    const userStake = stakeData ? (typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData) : null;
    
    return NextResponse.json({
      success: true,
      predictionId,
      redisId,
      redis: {
        id: pred.id,
        question: pred.question,
        resolved: pred.resolved,
        outcome: pred.outcome,
        cancelled: pred.cancelled,
        usdcPoolEnabled: pred.usdcPoolEnabled,
        usdcResolved: pred.usdcResolved,
        usdcCancelled: pred.usdcCancelled,
        usdcOutcome: pred.usdcOutcome,
        usdcYesTotalAmount: pred.usdcYesTotalAmount,
        usdcNoTotalAmount: pred.usdcNoTotalAmount,
        usdcYesTotalAmountUSD: pred.usdcYesTotalAmount ? pred.usdcYesTotalAmount / 1e6 : 0,
        usdcNoTotalAmountUSD: pred.usdcNoTotalAmount ? pred.usdcNoTotalAmount / 1e6 : 0
      },
      userStake: userStake ? {
        user: userStake.user,
        predictionId: userStake.predictionId,
        USDC: userStake.USDC,
        ETH: userStake.ETH,
        SWIPE: userStake.SWIPE
      } : null,
      comparison: {
        contractResolved: 'Check via /api/debug/usdc-prediction',
        redisResolved: pred.resolved,
        redisUsdcResolved: pred.usdcResolved,
        contractOutcome: 'Check via /api/debug/usdc-prediction',
        redisOutcome: pred.outcome,
        redisUsdcOutcome: pred.usdcOutcome,
        needsSync: !pred.usdcResolved || pred.usdcResolved !== true
      }
    });
  } catch (error) {
    console.error('Debug USDC Redis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch Redis data',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
