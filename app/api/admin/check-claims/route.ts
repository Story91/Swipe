import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';

export async function GET(request: NextRequest) {
  try {
    // Basic authorization check
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');
    
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    
    console.log('🔍 Checking claims for prediction:', predictionId);
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    // Ensure prediction ID has 'pred_' prefix
    const fullPredictionId = predictionId.startsWith('pred_') ? predictionId : `pred_${predictionId}`;
    console.log('📋 Full prediction ID:', fullPredictionId);
    
    // Get prediction details first
    const pred = await redisHelpers.getPrediction(fullPredictionId);
    if (!pred) {
      console.log('❌ Prediction not found:', fullPredictionId);
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    console.log('📊 Prediction data:', { resolved: pred.resolved, outcome: pred.outcome, cancelled: pred.cancelled });
    
    // Get all stakes for this prediction
    console.log('🔍 Getting stakes for prediction:', fullPredictionId);
    const stakes = await redisHelpers.getUserStakes(fullPredictionId);
    console.log('📋 Found stakes:', stakes.length);
    
    const claimed = [];
    const unclaimed = [];
    const lost = [];
    
    for (const stake of stakes) {
        const userId = stake.user;
        const isClaimed = stake.claimed;
        const stakeAmount = stake.yesAmount + stake.noAmount;
        
        // Check if stake is actually claimable
        const isClaimable = (pred.resolved || pred.cancelled) && (
          (pred.outcome && stake.yesAmount > 0) || // YES won and user bet YES
          (!pred.outcome && stake.noAmount > 0) || // NO won and user bet NO
          pred.cancelled // Refund for cancelled predictions
        );
        
        // Check if stake is lost (resolved but not claimable)
        const isLost = pred.resolved && !pred.cancelled && !isClaimable;
        
        const claimData = {
          userId,
          stakeAmount: stakeAmount / Math.pow(10, 18), // Convert to ETH
          yesAmount: stake.yesAmount / Math.pow(10, 18), // Convert to ETH
          noAmount: stake.noAmount / Math.pow(10, 18) // Convert to ETH
        };
        
        if (isClaimed) {
          claimed.push(claimData);
        } else if (isLost) {
          lost.push(claimData);
        } else if (isClaimable) {
          unclaimed.push(claimData);
        } else {
          // Default case - should not happen
          claimed.push(claimData);
        }
    }
    
    const totalStakes = stakes.length;
    const claimRate = totalStakes > 0 ? (claimed.length / totalStakes) * 100 : 0;
    
    console.log('📊 Results:', { totalStakes, claimed: claimed.length, unclaimed: unclaimed.length, lost: lost.length, claimRate });
    
    return NextResponse.json({
      success: true,
      data: {
        predictionId: fullPredictionId,
        totalStakes,
        claimed,
        unclaimed,
        lost,
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
