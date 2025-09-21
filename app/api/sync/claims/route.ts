import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redis, redisHelpers } from '../../../../lib/redis';

// Helper function to check if user already claimed via user transactions
async function hasUserClaimedViaTransactions(userId: string, predictionId: string): Promise<boolean> {
  try {
    const userTransactions = await redisHelpers.getUserTransactions(userId);
    const claimTransaction = userTransactions.find(tx => 
      tx.type === 'claim' && 
      tx.predictionId === predictionId && 
      tx.status === 'success'
    );
    return !!claimTransaction;
  } catch (error) {
    console.warn(`⚠️ Failed to check user transactions for ${userId}:`, error);
    return false;
  }
}

// Helper function to process individual stake claim (V2 only)
async function processStakeClaim(
  stakeToProcess: any, 
  originalStake: any, 
  prediction: any, 
  contractVersion: 'V2',
  contract: any,
  numericId: string
): Promise<boolean> {
  try {
    console.log(`🔍 Checking claim status for user ${stakeToProcess.user} on prediction ${prediction.id}`);
    console.log(`   Stake data:`, { 
      user: stakeToProcess.user, 
      claimed: stakeToProcess.claimed, 
      yesAmount: stakeToProcess.yesAmount, 
      noAmount: stakeToProcess.noAmount,
      tokenType: stakeToProcess.tokenType 
    });
    
    // First check if user already claimed via user transactions
    const claimedViaTransactions = await hasUserClaimedViaTransactions(stakeToProcess.user, prediction.id);
    if (claimedViaTransactions && !stakeToProcess.claimed) {
      console.log(`📋 User ${stakeToProcess.user} already claimed ${prediction.id} via user transactions - updating Redis`);
      
      // Update the stake data - V2 multi-token format only
      if (stakeToProcess.tokenType === 'ETH' && originalStake.ETH) {
        originalStake.ETH.claimed = true;
      } else if (stakeToProcess.tokenType === 'SWIPE' && originalStake.SWIPE) {
        originalStake.SWIPE.claimed = true;
      }
      
      await redisHelpers.saveUserStake(originalStake);
      console.log(`✅ Synced claim status from user transactions for user ${stakeToProcess.user} on prediction ${prediction.id}`);
      return true;
    }
    
    // Check claim status on blockchain
    const userStakeData = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'userStakes',
      args: [BigInt(numericId), stakeToProcess.user as `0x${string}`],
    }) as any;
    
    console.log(`   Blockchain data:`, userStakeData);

    // V2 returns struct {yesAmount, noAmount, claimed}
    const isClaimedOnChain = userStakeData.claimed;

    // Update Redis if different
    if (isClaimedOnChain && !stakeToProcess.claimed) {
      // Update the stake data - V2 multi-token format only
      if (stakeToProcess.tokenType === 'ETH' && originalStake.ETH) {
        originalStake.ETH.claimed = true;
      } else if (stakeToProcess.tokenType === 'SWIPE' && originalStake.SWIPE) {
        originalStake.SWIPE.claimed = true;
      }
      
      await redisHelpers.saveUserStake(originalStake);
      console.log(`✅ Synced claim status for user ${stakeToProcess.user} on prediction ${prediction.id}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Failed to sync claim for user ${stakeToProcess.user} on prediction ${prediction.id}:`, error);
    console.error(`   Contract: ${contract.address}, Numeric ID: ${numericId}, Contract Version: ${contractVersion}`);
    console.error(`   Stake data:`, { user: stakeToProcess.user, claimed: stakeToProcess.claimed, yesAmount: stakeToProcess.yesAmount, noAmount: stakeToProcess.noAmount });
    throw error;
  }
}

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/sync/claims - Sync claim status from blockchain to Redis
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting claims sync from blockchain to Redis...');

    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    const userId = searchParams.get('userId');

    let syncedCount = 0;
    let errorsCount = 0;

    if (predictionId) {
      // Sync specific prediction
      const prediction = await redisHelpers.getPrediction(predictionId);
      if (!prediction) {
        return NextResponse.json(
          { success: false, error: 'Prediction not found in Redis' },
          { status: 404 }
        );
      }

      // Determine contract version based on prediction ID
      let contractVersion: 'V1' | 'V2';
      if (predictionId.startsWith('pred_v1_')) {
        contractVersion = 'V1';
      } else if (predictionId.startsWith('pred_v2_')) {
        contractVersion = 'V2';
      } else if (predictionId.startsWith('pred_') && !predictionId.includes('v1') && !predictionId.includes('v2')) {
        // Old format pred_X - check if it's V1 or V2 based on contractVersion field
        contractVersion = prediction.contractVersion || 'V1'; // Default to V1 for old format
      } else {
        contractVersion = prediction.contractVersion || 'V2'; // Default to V2
      }
      
      const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
      const numericId = predictionId.replace(/^pred_(v1|v2)_/, '');

      if (userId) {
        // Sync specific user's claim status
        try {
          const stakeKey = `user_stakes:${userId}:${predictionId}`;
          const existingData = await redis.get(stakeKey);
          
          if (existingData) {
            const existingStake = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
            
            // Check claim status on blockchain
            const userStakeData = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'userStakes',
              args: [BigInt(numericId), userId as `0x${string}`],
            }) as any;

            // V1 returns tuple [yesAmount, noAmount, claimed], V2 returns struct {yesAmount, noAmount, claimed}
            const isClaimedOnChain = contractVersion === 'V1' ? userStakeData[2] : userStakeData.claimed;

            // Update Redis if different - handle both V1 and V2 multi-token formats
            let shouldUpdate = false;
            if (isClaimedOnChain) {
              if ((existingStake as any).ETH || (existingStake as any).SWIPE) {
                // V2 multi-token format
                if ((existingStake as any).ETH && !(existingStake as any).ETH.claimed) {
                  (existingStake as any).ETH.claimed = true;
                  shouldUpdate = true;
                }
                if ((existingStake as any).SWIPE && !(existingStake as any).SWIPE.claimed) {
                  (existingStake as any).SWIPE.claimed = true;
                  shouldUpdate = true;
                }
              } else {
                // V1 single stake format
                if (!existingStake.claimed) {
                  existingStake.claimed = true;
                  shouldUpdate = true;
                }
              }
              
              if (shouldUpdate) {
                await redisHelpers.saveUserStake(existingStake);
                syncedCount++;
                console.log(`✅ Synced claim status for user ${userId} on prediction ${predictionId}`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync claim for user ${userId}:`, error);
          errorsCount++;
        }
      } else {
        // Sync all users' claim status for this prediction
        const stakes = await redisHelpers.getUserStakes(predictionId);
        
        for (const stake of stakes) {
          try {
            // Check claim status on blockchain
            const userStakeData = await publicClient.readContract({
              address: contract.address as `0x${string}`,
              abi: contract.abi,
              functionName: 'userStakes',
              args: [BigInt(numericId), stake.user as `0x${string}`],
            }) as any;

            // V1 returns tuple [yesAmount, noAmount, claimed], V2 returns struct {yesAmount, noAmount, claimed}
            const isClaimedOnChain = contractVersion === 'V1' ? userStakeData[2] : userStakeData.claimed;

            // Update Redis if different - handle both V1 and V2 multi-token formats
            let shouldUpdate = false;
            if (isClaimedOnChain) {
              if ((stake as any).ETH || (stake as any).SWIPE) {
                // V2 multi-token format
                if ((stake as any).ETH && !(stake as any).ETH.claimed) {
                  (stake as any).ETH.claimed = true;
                  shouldUpdate = true;
                }
                if ((stake as any).SWIPE && !(stake as any).SWIPE.claimed) {
                  (stake as any).SWIPE.claimed = true;
                  shouldUpdate = true;
                }
              } else {
                // V1 single stake format
                if (!stake.claimed) {
                  stake.claimed = true;
                  shouldUpdate = true;
                }
              }
              
              if (shouldUpdate) {
                await redisHelpers.saveUserStake(stake);
                syncedCount++;
                console.log(`✅ Synced claim status for user ${stake.user} on prediction ${predictionId}`);
              }
            }
          } catch (error) {
            console.error(`❌ Failed to sync claim for user ${stake.user}:`, error);
            errorsCount++;
          }
        }
      }
    } else {
      // Sync only "ready to claim" predictions - much more efficient!
      console.log('🔄 Syncing claims for ready-to-claim predictions only...');
      
      // Get all predictions
      const allPredictions = await redisHelpers.getAllPredictions();
      
      // Filter to only V2 resolved predictions (ready to claim)
      const v2ResolvedPredictions = allPredictions.filter(p => 
        p.resolved && p.id.startsWith('pred_v2_')
      );
      console.log(`📊 Found ${v2ResolvedPredictions.length} V2 resolved predictions (out of ${allPredictions.length} total)`);
      
      // Log resolved prediction IDs for debugging
      console.log(`📋 V2 Resolved prediction IDs:`, v2ResolvedPredictions.map(p => p.id));
      
      // Also log all predictions to see what we have
      console.log(`📋 All predictions:`, allPredictions.map(p => ({ id: p.id, resolved: p.resolved, deadline: p.deadline })));
      
      // Further optimization: only process predictions that have unclaimed stakes
      const predictionsWithUnclaimedStakes = [];
      
      for (const prediction of v2ResolvedPredictions) {
        try {
          const stakes = await redisHelpers.getUserStakes(prediction.id);
          
          // Filter for unclaimed stakes - V2 multi-token format only
          const unclaimedStakes = stakes.filter(stake => {
            // Skip stakes with invalid data
            if (!stake.user || stake.user === 'undefined') {
              return false;
            }
            
            // V2 multi-token format only
            if ((stake as any).ETH || (stake as any).SWIPE) {
              const ethClaimed = (stake as any).ETH?.claimed || false;
              const swipeClaimed = (stake as any).SWIPE?.claimed || false;
              return !ethClaimed || !swipeClaimed; // At least one token type is unclaimed
            }
            
            return false; // Skip any non-V2 format stakes
          });
          
          if (unclaimedStakes.length > 0) {
            predictionsWithUnclaimedStakes.push({
              prediction,
              unclaimedStakes
            });
            console.log(`🔍 Prediction ${prediction.id} has ${unclaimedStakes.length} unclaimed stakes`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to check stakes for prediction ${prediction.id}:`, error);
        }
      }
      
      console.log(`📊 Processing ${predictionsWithUnclaimedStakes.length} predictions with unclaimed stakes`);
      
      for (const { prediction, unclaimedStakes } of predictionsWithUnclaimedStakes) {
        try {
          // Only V2 contract
          const contractVersion: 'V2' = 'V2';
          const contract = CONTRACTS.V2;
          const numericId = prediction.id.replace(/^pred_v2_/, '');
          
          console.log(`🔍 Processing prediction ${prediction.id} with V2 contract`);
          
          console.log(`🔍 Processing ${unclaimedStakes.length} unclaimed stakes for prediction ${prediction.id}`);
          
          for (const stake of unclaimedStakes) {
            try {
              // Skip stakes with invalid data
              if (!stake.user || stake.user === 'undefined') {
                console.warn(`⚠️ Skipping stake with invalid user: ${stake.user} on prediction ${prediction.id}`);
                continue;
              }
              
              // V2 multi-token format only
              if ((stake as any).ETH || (stake as any).SWIPE) {
                // V2 multi-token format - process both ETH and SWIPE stakes
                const stakesToProcess = [];
                
                if ((stake as any).ETH) {
                  stakesToProcess.push({
                    ...stake,
                    yesAmount: (stake as any).ETH.yesAmount,
                    noAmount: (stake as any).ETH.noAmount,
                    claimed: (stake as any).ETH.claimed,
                    tokenType: 'ETH'
                  });
                }
                
                if ((stake as any).SWIPE) {
                  stakesToProcess.push({
                    ...stake,
                    yesAmount: (stake as any).SWIPE.yesAmount,
                    noAmount: (stake as any).SWIPE.noAmount,
                    claimed: (stake as any).SWIPE.claimed,
                    tokenType: 'SWIPE'
                  });
                }
                
                // Process each stake separately
                for (const stakeToProcess of stakesToProcess) {
                  try {
                    const wasSynced = await processStakeClaim(stakeToProcess, stake, prediction, contractVersion, contract, numericId);
                    if (wasSynced) syncedCount++;
                  } catch (error) {
                    errorsCount++;
                  }
                }
              } else {
                console.warn(`⚠️ Skipping non-V2 stake format for prediction ${prediction.id}`);
              }
            } catch (error) {
              console.error(`❌ Failed to process stake for prediction ${prediction.id}:`, error);
              errorsCount++;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync claims for prediction ${prediction.id}:`, error);
          errorsCount++;
        }
      }
    }

    console.log(`🎉 Claims sync completed! Synced: ${syncedCount} claims, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      message: 'Claims sync completed',
      data: {
        syncedCount,
        errorsCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Claims sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync claims from blockchain to Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
