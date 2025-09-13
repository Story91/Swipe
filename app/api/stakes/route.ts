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

// POST /api/stakes - Place a new stake
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['userId', 'predictionId', 'amount', 'isYes'];
    for (const field of requiredFields) {
      if (body[field] === undefined) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Missing required field: ${field}` 
          },
          { status: 400 }
        );
      }
    }
    
    const { userId, predictionId, amount, isYes } = body;
    
    // Validate amount
    if (typeof amount !== 'number' || amount < 0.001 || amount > 100) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Amount must be between 0.001 and 100 ETH' 
        },
        { status: 400 }
      );
    }
    
    // Check if prediction exists
    const prediction = await redisHelpers.getPrediction(predictionId);
    if (!prediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Check if prediction is still active
    if (prediction.resolved || prediction.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Cannot stake on resolved or cancelled prediction' },
        { status: 400 }
      );
    }
    
    // Check if deadline has passed
    const now = Math.floor(Date.now() / 1000);
    if (now >= prediction.deadline) {
      return NextResponse.json(
        { success: false, error: 'Prediction deadline has passed' },
        { status: 400 }
      );
    }
    
    // Get existing stake or create new one
    const stakeKey = `user_stakes:${userId}:${predictionId}`;
    const existingData = await redis.get(stakeKey);
    let existingStake: RedisUserStake | null = null;
    
    if (existingData) {
      const parsed = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
      if (parsed && typeof parsed === 'object' && 'userId' in parsed) {
        existingStake = parsed as RedisUserStake;
      }
    }
    
    // Create or update stake
    const stake: RedisUserStake = {
      user: userId,
      predictionId,
      yesAmount: existingStake ? existingStake.yesAmount + (isYes ? amount : 0) : (isYes ? amount : 0),
      noAmount: existingStake ? existingStake.noAmount + (isYes ? 0 : amount) : (isYes ? 0 : amount),
      claimed: false,
      stakedAt: existingStake ? existingStake.stakedAt : now
    };
    
    // Save stake
    await redisHelpers.saveUserStake(stake);
    
    // Update prediction totals
    const updatedPrediction = { ...prediction };
    if (isYes) {
      updatedPrediction.yesTotalAmount += amount;
    } else {
      updatedPrediction.noTotalAmount += amount;
    }
    updatedPrediction.totalStakes += amount;
    
    // Add user to participants if not already there
    if (!updatedPrediction.participants.includes(userId)) {
      updatedPrediction.participants.push(userId);
    }
    
    // Update market stats
    const totalPool = updatedPrediction.yesTotalAmount + updatedPrediction.noTotalAmount;
    updatedPrediction.marketStats = {
      yesPercentage: totalPool > 0 ? (updatedPrediction.yesTotalAmount / totalPool) * 100 : 0,
      noPercentage: totalPool > 0 ? (updatedPrediction.noTotalAmount / totalPool) * 100 : 0,
      timeLeft: updatedPrediction.deadline - now,
      totalPool
    };
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    // Update global market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Stake placed: ${userId} staked ${amount} ETH on ${isYes ? 'YES' : 'NO'} for prediction ${predictionId}`);
    
    return NextResponse.json({
      success: true,
      data: {
        stake,
        prediction: updatedPrediction
      },
      message: 'Stake placed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to place stake:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to place stake',
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

