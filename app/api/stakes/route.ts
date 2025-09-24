import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../lib/redis';
import { RedisUserStake } from '../../../lib/types/redis';

// GET /api/stakes - Get stakes for a specific prediction or all user stakes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    const userId = searchParams.get('userId');
    const getAllUserStakes = searchParams.get('getAllUserStakes') === 'true';
    
    // If getAllUserStakes is true, return all stakes for the user
    if (getAllUserStakes && userId) {
      console.log(`🔍 Getting all stakes for user: ${userId}`);
      
      // Get all stake keys for this user
      const userStakePattern = `user_stakes:${userId}:*`;
      const stakeKeys = await redis.keys(userStakePattern);
      
      console.log(`📊 Found ${stakeKeys.length} stake keys for user ${userId}`);
      
      const allUserStakes: RedisUserStake[] = [];
      
      // Fetch all stakes in parallel
      const stakePromises = stakeKeys.map(async (key) => {
        try {
          const data = await redis.get(key);
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
                return multiStakes;
              } else {
                // Single stake (V1) - convert to array format
                return [{
                  user: stake.user,
                  predictionId: stake.predictionId,
                  yesAmount: stake.yesAmount || 0,
                  noAmount: stake.noAmount || 0,
                  claimed: stake.claimed || false,
                  stakedAt: stake.stakedAt,
                  contractVersion: stake.contractVersion || 'V1',
                  tokenType: 'ETH' // V1 stakes are always ETH
                }];
              }
            }
          }
          return [];
        } catch (error) {
          console.error(`Failed to parse stake from key ${key}:`, error);
          return [];
        }
      });
      
      const stakeResults = await Promise.all(stakePromises);
      stakeResults.forEach(stakes => {
        allUserStakes.push(...stakes);
      });
      
      console.log(`✅ Returning ${allUserStakes.length} total stakes for user ${userId}`);
      
      return NextResponse.json({
        success: true,
        data: allUserStakes,
        count: allUserStakes.length
      });
    }
    
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

    // Get prediction data to calculate canClaim
    const predictionData = await redis.get(`prediction:${predictionId}`);
    let prediction: any = null;
    if (predictionData) {
      prediction = typeof predictionData === 'string' ? JSON.parse(predictionData) : predictionData;
    }

    // Calculate canClaim for each stake
    const stakesWithCanClaim = stakes.map(stake => {
      let canClaim = false;
      
      if (prediction) {
        const isResolved = prediction.resolved || prediction.cancelled;
        
        if (isResolved && !stake.claimed) {
          if (prediction.cancelled) {
            // Can claim refund if cancelled
            canClaim = stake.yesAmount > 0 || stake.noAmount > 0;
          } else if (prediction.resolved) {
            // Can claim if user won
            const userChoice = stake.yesAmount > stake.noAmount ? 'YES' : 'NO';
            const userWon = (userChoice === 'YES' && prediction.outcome) || (userChoice === 'NO' && !prediction.outcome);
            canClaim = userWon;
          }
        } else if (stake.claimed) {
          // Already claimed - cannot claim again
          canClaim = false;
        }
      }
      
      return {
        ...stake,
        canClaim
      };
    });
    
    
    return NextResponse.json({
      success: true,
      data: stakesWithCanClaim,
      count: stakesWithCanClaim.length,
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

