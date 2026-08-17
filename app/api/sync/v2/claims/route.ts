import { NextRequest, NextResponse } from 'next/server';
import { createChainPublicClient } from '@/lib/chains';
import { CONTRACTS } from '../../../../../lib/contract';
import { redisHelpers } from '../../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createChainPublicClient();

/**
 * Every read below goes to CONTRACTS.V2, which is a Base address, so the Redis
 * records written from it are Base's. Named rather than left to the default: a
 * sync route that inherits its chain is one config change away from writing one
 * chain's contract state into another chain's keyspace, and the value would be
 * right either way today, which is exactly what makes it worth pinning.
 */
const SYNC_CHAIN = 'base' as const;

// Helper function for retry with backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.log(`❌ Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// GET /api/sync/v2/claims - Sync claim status for all resolved predictions
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting V2 claims sync...');

    // Get all resolved predictions from Redis
    const allPredictions = await redisHelpers.getAllPredictions(SYNC_CHAIN);
    const resolvedPredictions = allPredictions.filter(p => p.resolved || p.cancelled);
    
    console.log(`📊 Found ${resolvedPredictions.length} resolved predictions to check claims for`);

    let syncedClaims = 0;
    let errorsCount = 0;

    // Check claims for each resolved prediction
    for (const prediction of resolvedPredictions) {
      try {
        // Extract numeric ID from prediction ID (e.g., "pred_v1_123" or "pred_v2_123" -> "123")
        const numericId = prediction.id.replace(/^pred_v[12]_/, '');
        
        console.log(`🔍 Checking claims for prediction ${prediction.id} (numeric: ${numericId})...`);

        // Get all stakes for this prediction from Redis
        const stakes = await redisHelpers.getUserStakes(prediction.id, SYNC_CHAIN);
        
        if (stakes.length === 0) {
          console.log(`⚠️ No stakes found for prediction ${prediction.id}`);
          continue;
        }

        console.log(`📊 Found ${stakes.length} stakes for prediction ${prediction.id}`);

        // Check each stake's claim status on blockchain - but only if it appears as "ready to claim" in Redis
        for (const stake of stakes) {
          try {
            // Skip if stake doesn't appear as "ready to claim" in Redis
            const hasUnclaimedEth = (stake as any).ETH && !(stake as any).ETH.claimed;
            const hasUnclaimedSwipe = (stake as any).SWIPE && !(stake as any).SWIPE.claimed;
            
            if (!hasUnclaimedEth && !hasUnclaimedSwipe) {
              console.log(`⏭️ Skipping user ${stake.user} - no unclaimed rewards in Redis`);
              continue;
            }

            console.log(`🔍 Checking user ${stake.user} - appears to have unclaimed rewards in Redis`);

            // Get user stake data from blockchain
            const userStakeData = await retryWithBackoff(async () => {
              return await publicClient.readContract({
                address: CONTRACTS.V2.address as `0x${string}`,
                abi: CONTRACTS.V2.abi,
                functionName: 'userStakes',
                args: [BigInt(numericId), stake.user as `0x${string}`],
              });
            }) as any;

            // V2 returns struct with separate ETH and SWIPE claims
            const ethClaimed = userStakeData.ethClaimed || false;
            const swipeClaimed = userStakeData.swipeClaimed || false;

            console.log(`🔍 User ${stake.user} claim status - ETH: ${ethClaimed}, SWIPE: ${swipeClaimed}`);

            // Update Redis stake data if claim status changed
            let needsUpdate = false;
            const updatedStake = { ...stake } as any;

            // Check ETH claims - only update if Redis shows unclaimed but blockchain shows claimed
            if ((stake as any).ETH && (stake as any).ETH.claimed !== ethClaimed) {
              updatedStake.ETH.claimed = ethClaimed;
              needsUpdate = true;
              console.log(`🔄 Updated ETH claim status for user ${stake.user}: Redis=${(stake as any).ETH.claimed} → Blockchain=${ethClaimed}`);
            }

            // Check SWIPE claims - only update if Redis shows unclaimed but blockchain shows claimed
            if ((stake as any).SWIPE && (stake as any).SWIPE.claimed !== swipeClaimed) {
              updatedStake.SWIPE.claimed = swipeClaimed;
              needsUpdate = true;
              console.log(`🔄 Updated SWIPE claim status for user ${stake.user}: Redis=${(stake as any).SWIPE.claimed} → Blockchain=${swipeClaimed}`);
            }

            // Save updated stake if needed
            if (needsUpdate) {
              await redisHelpers.saveUserStake(updatedStake, SYNC_CHAIN);
              syncedClaims++;
              console.log(`✅ Fixed claim status for user ${stake.user} in prediction ${prediction.id}`);
            } else {
              console.log(`✅ User ${stake.user} claim status is already correct`);
            }

          } catch (stakeError) {
            console.error(`❌ Failed to check claim status for user ${stake.user} on prediction ${prediction.id}:`, stakeError);
          }
        }

      } catch (error) {
        console.error(`❌ Failed to sync claims for prediction ${prediction.id}:`, error);
        errorsCount++;
      }
    }

    console.log(`🎉 V2 claims sync completed! Synced: ${syncedClaims} claim statuses, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'V2 claims sync completed',
      data: {
        contractVersion: 'V2',
        syncedClaims,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ V2 claims sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync V2 claims',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
