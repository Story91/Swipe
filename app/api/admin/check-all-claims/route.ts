import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';

export async function GET(request: NextRequest) {
  try {
    // Get all prediction IDs
    const predictionKeys = await redis.keys('prediction:*');
    const predictionIds = predictionKeys.map(key => key.replace('prediction:', ''));
    
    const allResults = [];
    
    for (const predictionId of predictionIds) {
      // Get all stakes for this prediction
      const pattern = `user_stakes:*:${predictionId}`;
      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) continue;
      
      const claimed = [];
      const unclaimed = [];
      
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const stake = typeof data === 'string' ? JSON.parse(data) : data;
          const userId = stake.userId;
          const isClaimed = stake.claimed;
          const stakeAmount = stake.yesAmount + stake.noAmount;
          
          // Check if stake is actually claimable
          const isClaimable = (prediction.resolved || prediction.cancelled) && (
            (prediction.outcome && stake.yesAmount > 0) || // YES won and user bet YES
            (!prediction.outcome && stake.noAmount > 0) || // NO won and user bet NO
            prediction.cancelled // Refund for cancelled predictions
          );
          
          const claimData = {
            userId,
            stakeAmount: stakeAmount / Math.pow(10, 18), // Convert to ETH
            yesAmount: stake.yesAmount / Math.pow(10, 18), // Convert to ETH
            noAmount: stake.noAmount / Math.pow(10, 18) // Convert to ETH
          };
          
          if (isClaimed || !isClaimable) {
            // If already claimed OR not claimable, it's "claimed" for this purpose
            claimed.push(claimData);
          } else {
            // Only truly claimable stakes are "unclaimed"
            unclaimed.push(claimData);
          }
        }
      }
      
      const totalStakes = keys.length;
      const claimRate = totalStakes > 0 ? (claimed.length / totalStakes) * 100 : 0;
      
      allResults.push({
        predictionId,
        totalStakes,
        claimed: claimed.length,
        unclaimed: unclaimed.length,
        claimRate,
        claimedUsers: claimed,
        unclaimedUsers: unclaimed
      });
    }
    
    // Sort by unclaimed count (descending)
    allResults.sort((a, b) => b.unclaimed - a.unclaimed);
    
    return NextResponse.json({
      success: true,
      data: {
        predictionId: 'ALL_PREDICTIONS',
        totalStakes: allResults.reduce((sum, r) => sum + r.totalStakes, 0),
        claimed: allResults.reduce((sum, r) => sum + r.claimed, 0),
        unclaimed: allResults.reduce((sum, r) => sum + r.unclaimed, 0),
        claimRate: allResults.length > 0 ? 
          allResults.reduce((sum, r) => sum + r.claimRate, 0) / allResults.length : 0,
        predictions: allResults
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to check all claims:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check all claims',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
