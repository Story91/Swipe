import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    // Ensure prediction ID has 'pred_' prefix
    const fullPredictionId = predictionId.startsWith('pred_') ? predictionId : `pred_${predictionId}`;
    
    // Get all stakes for this prediction
    const pattern = `user_stakes:*:${fullPredictionId}`;
    const keys = await redis.keys(pattern);
    
    const claimed = [];
    const unclaimed = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const stake = typeof data === 'string' ? JSON.parse(data) : data;
        const userId = stake.userId;
        const isClaimed = stake.claimed;
        const stakeAmount = stake.yesAmount + stake.noAmount;
        
        const claimData = {
          userId,
          stakeAmount: stakeAmount / Math.pow(10, 18), // Convert to ETH
          yesAmount: stake.yesAmount / Math.pow(10, 18), // Convert to ETH
          noAmount: stake.noAmount / Math.pow(10, 18) // Convert to ETH
        };
        
        if (isClaimed) {
          claimed.push(claimData);
        } else {
          unclaimed.push(claimData);
        }
      }
    }
    
    const totalStakes = keys.length;
    const claimRate = totalStakes > 0 ? (claimed.length / totalStakes) * 100 : 0;
    
    return NextResponse.json({
      success: true,
      data: {
        predictionId,
        totalStakes,
        claimed,
        unclaimed,
        claimRate
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to check claims:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check claims',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
