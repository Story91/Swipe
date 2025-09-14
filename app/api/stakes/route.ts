import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../lib/redis';
import { RedisUserStake } from '../../../lib/types/redis';

// GET /api/stakes - Get stakes for a specific prediction
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    const userId = searchParams.get('userId');
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    let stakes: RedisUserStake[] = [];
    
    if (userId) {
      // Get specific user's stake for this prediction
      const stakeKey = `user_stakes:${userId}:${predictionId}`;
      const data = await redis.get(stakeKey);
      if (data) {
        const stake = typeof data === 'string' ? JSON.parse(data) : data;
        if (stake && typeof stake === 'object' && 'user' in stake) {
          // Check if this is a multi-token stake (V2) or single stake (V1)
          if (stake.ETH || stake.SWIPE) {
            // Multi-token stake - convert to array format
            const multiStakes: RedisUserStake[] = [];
            if (stake.ETH) {
              multiStakes.push({
                user: stake.user,
                predictionId: stake.predictionId,
                yesAmount: stake.ETH.yesAmount,
                noAmount: stake.ETH.noAmount,
                claimed: stake.ETH.claimed,
                stakedAt: stake.stakedAt,
                contractVersion: stake.contractVersion,
                tokenType: 'ETH'
              });
            }
            if (stake.SWIPE) {
              multiStakes.push({
                user: stake.user,
                predictionId: stake.predictionId,
                yesAmount: stake.SWIPE.yesAmount,
                noAmount: stake.SWIPE.noAmount,
                claimed: stake.SWIPE.claimed,
                stakedAt: stake.stakedAt,
                contractVersion: stake.contractVersion,
                tokenType: 'SWIPE'
              });
            }
            stakes = multiStakes;
          } else {
            // Single stake (V1)
            stakes = [stake as RedisUserStake];
          }
        }
      }
    } else {
      // Get all stakes for this prediction
      stakes = await redisHelpers.getUserStakes(predictionId);
    }
    
    return NextResponse.json({
      success: true,
      data: stakes,
      count: stakes.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get stakes:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch stakes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


// PUT /api/stakes - Update stake (e.g., mark as claimed)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, predictionId, updates } = body;
    
    if (!userId || !predictionId) {
      return NextResponse.json(
        { success: false, error: 'User ID and Prediction ID are required' },
        { status: 400 }
      );
    }
    
    // Get existing stake
    const stakeKey = `user_stakes:${userId}:${predictionId}`;
    const existingData = await redis.get(stakeKey);
    
    if (!existingData) {
      return NextResponse.json(
        { success: false, error: 'Stake not found' },
        { status: 404 }
      );
    }
    
    const existingStake = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
    
    // Update allowed fields
    const allowedUpdates = ['claimed'];
    const updatedStake = { ...existingStake };
    
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        (updatedStake as any)[field] = updates[field];
      }
    }
    
    // Save updated stake
    await redisHelpers.saveUserStake(updatedStake);
    
    return NextResponse.json({
      success: true,
      data: updatedStake,
      message: 'Stake updated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to update stake:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update stake',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

