import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';
import { requireAdmin } from '../../../../lib/auth/requireAdmin';
import { parseMarketId } from '@/lib/marketId';

// This endpoint is the sole resolution authority for predictions that live only in
// Redis and were never registered on-chain. Anything backed by a contract must be
// resolved through that contract instead: writing its Redis mirror directly would
// desynchronise it from the chain until the next sync, and a market that Redis
// calls resolved while the chain does not is one where the claim button appears
// and every claim reverts.
//
// The list used to be spelled out as v1 and v2, so pred_v3_ fell through it and a
// V3 market could have been resolved here. Asking the id parser which generation
// minted it means a future generation cannot be forgotten the same way.
const CONTRACT_BACKED: ReadonlySet<string> = new Set(['v1', 'v2', 'v3']);

function isPureRedisPrediction(predictionId: string): boolean {
  if (typeof predictionId !== 'string' || !predictionId.startsWith('pred_')) return false;
  const generation = parseMarketId(predictionId)?.generation;
  return generation === undefined || !CONTRACT_BACKED.has(generation);
}

// POST /api/predictions/resolve - Resolve a Redis-based prediction
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, 'resolve');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { predictionId, outcome, reason } = body;

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    if (!isPureRedisPrediction(predictionId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'On-chain predictions must be resolved via the contract, not this endpoint'
        },
        { status: 400 }
      );
    }

    if (typeof outcome !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Outcome must be true (YES) or false (NO)' },
        { status: 400 }
      );
    }
    
    // Get existing prediction
    const existingPrediction = await redisHelpers.getPrediction(predictionId);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Check if prediction is already resolved or cancelled
    if (existingPrediction.resolved) {
      return NextResponse.json(
        { success: false, error: 'Prediction is already resolved' },
        { status: 400 }
      );
    }
    
    if (existingPrediction.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Prediction is cancelled' },
        { status: 400 }
      );
    }
    
    // Check if deadline has passed
    const now = Math.floor(Date.now() / 1000);
    if (now < existingPrediction.deadline) {
      return NextResponse.json(
        { success: false, error: 'Cannot resolve prediction before deadline' },
        { status: 400 }
      );
    }
    
    // Update prediction with resolution
    const updatedPrediction = {
      ...existingPrediction,
      resolved: true,
      outcome: outcome,
      resolvedAt: now,
      resolvedBy: auth.address, // verified by signature, not self-reported
      resolutionReason: reason || 'Admin resolution'
    };
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Prediction ${predictionId} resolved as ${outcome ? 'YES' : 'NO'}`);
    
    // Update user stakes in Redis immediately after resolve
    try {
      console.log('🔄 Updating user stakes after prediction resolve...');
      
      // Get all stakes for this prediction
      const stakes = await redisHelpers.getUserStakes(predictionId);
      console.log(`📊 Found ${stakes.length} stakes for prediction ${predictionId}`);
      
      let updatedStakes = 0;
      
      for (const stake of stakes) {
        if (!stake.user) continue;
        
        try {
          // For V2 multi-token format, we need to check both ETH and SWIPE stakes
          if ((stake as any).ETH || (stake as any).SWIPE) {
            let needsUpdate = false;
            const updatedStake = { ...stake };
            
            // Check ETH stake
            if ((stake as any).ETH && (stake as any).ETH.yesAmount > 0) {
              const userChoice = (stake as any).ETH.yesAmount > (stake as any).ETH.noAmount ? 'YES' : 'NO';
              const isWinner = (userChoice === 'YES' && outcome) || (userChoice === 'NO' && !outcome);
              
              if (isWinner && !(stake as any).ETH.claimed) {
                // User won but hasn't claimed yet - mark as ready to claim
                console.log(`🎯 User ${stake.user} won ETH stake for prediction ${predictionId} - marking as ready to claim`);
                (updatedStake as any).ETH.claimed = false; // Keep false so it shows in "ready to claim"
                needsUpdate = true;
              }
            }
            
            // Check SWIPE stake
            if ((stake as any).SWIPE && (stake as any).SWIPE.yesAmount > 0) {
              const userChoice = (stake as any).SWIPE.yesAmount > (stake as any).SWIPE.noAmount ? 'YES' : 'NO';
              const isWinner = (userChoice === 'YES' && outcome) || (userChoice === 'NO' && !outcome);
              
              if (isWinner && !(stake as any).SWIPE.claimed) {
                // User won but hasn't claimed yet - mark as ready to claim
                console.log(`🎯 User ${stake.user} won SWIPE stake for prediction ${predictionId} - marking as ready to claim`);
                (updatedStake as any).SWIPE.claimed = false; // Keep false so it shows in "ready to claim"
                needsUpdate = true;
              }
            }
            
            // Save the stake only if it needs update
            if (needsUpdate) {
              await redisHelpers.saveUserStake(updatedStake);
              updatedStakes++;
            }
            
          } else {
            // For V1 format or legacy stakes
            const userChoice = stake.yesAmount > stake.noAmount ? 'YES' : 'NO';
            const isWinner = (userChoice === 'YES' && outcome) || (userChoice === 'NO' && !outcome);
            
            if (isWinner && !stake.claimed) {
              console.log(`🎯 User ${stake.user} won legacy stake for prediction ${predictionId} - marking as ready to claim`);
              stake.claimed = false; // Keep false so it shows in "ready to claim"
              await redisHelpers.saveUserStake(stake);
              updatedStakes++;
            }
          }
        } catch (stakeError) {
          console.error(`❌ Failed to update stake for user ${stake.user}:`, stakeError);
        }
      }
      
      console.log(`✅ Updated ${updatedStakes} stakes after resolve`);
      
    } catch (stakeUpdateError) {
      console.error('❌ Failed to update user stakes after resolve:', stakeUpdateError);
    }
    
    // Auto-sync claims after resolve to update user stakes
    try {
      console.log('🔄 Auto-syncing claims after prediction resolve...');
      const syncResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sync/v2/claims`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`,
        },
      });
      
      if (syncResponse.ok) {
        const syncResult = await syncResponse.json();
        console.log('✅ Auto-sync claims successful:', syncResult);
      } else {
        console.warn('⚠️ Auto-sync claims failed:', await syncResponse.text());
      }
    } catch (syncError) {
      console.error('❌ Auto-sync claims error:', syncError);
    }
    
    return NextResponse.json({
      success: true,
      data: updatedPrediction,
      message: `Prediction resolved as ${outcome ? 'YES' : 'NO'} and claims synced`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to resolve prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to resolve prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/predictions/resolve/cancel - Cancel a Redis-based prediction
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, 'cancel');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { predictionId, reason } = body;
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    if (!isPureRedisPrediction(predictionId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'On-chain predictions must be cancelled via the contract, not this endpoint'
        },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cancellation reason is required' },
        { status: 400 }
      );
    }
    
    // Get existing prediction
    const existingPrediction = await redisHelpers.getPrediction(predictionId);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Check if prediction is already resolved or cancelled
    if (existingPrediction.resolved) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel resolved prediction' },
        { status: 400 }
      );
    }
    
    if (existingPrediction.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Prediction is already cancelled' },
        { status: 400 }
      );
    }
    
    // Update prediction with cancellation
    const updatedPrediction = {
      ...existingPrediction,
      cancelled: true,
      cancelledAt: Math.floor(Date.now() / 1000),
      cancelledBy: auth.address, // verified by signature, not self-reported
      cancellationReason: reason.trim()
    };
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Prediction ${predictionId} cancelled: ${reason}`);
    
    return NextResponse.json({
      success: true,
      data: updatedPrediction,
      message: 'Prediction cancelled successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to cancel prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cancel prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
