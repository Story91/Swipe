import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../lib/redis';

// POST /api/manual-update-stake - Manually update stake as claimed
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, predictionId, claimed = true } = body;
    
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
    
    // Update stake
    const updatedStake = {
      ...existingStake,
      claimed: claimed
    };
    
    // Save updated stake
    await redisHelpers.saveUserStake(updatedStake);
    
    console.log(`✅ Manually updated stake: ${userId} on ${predictionId} - claimed: ${claimed}`);
    
    return NextResponse.json({
      success: true,
      data: updatedStake,
      message: `Stake updated successfully - claimed: ${claimed}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to manually update stake:', error);
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
