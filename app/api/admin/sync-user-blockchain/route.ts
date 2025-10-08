import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';
import { redis, redisHelpers } from '../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// POST /api/admin/sync-user-blockchain - Sync all user stakes from blockchain
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }

    console.log(`🔍 Starting blockchain sync for user: ${userId}`);

    // Get total number of predictions from V2 contract
    const totalPredictions = await publicClient.readContract({
      address: CONTRACTS.V2.address as `0x${string}`,
      abi: CONTRACTS.V2.abi,
      functionName: 'nextPredictionId',
      args: [],
    });

    const totalCountNumber = Number(totalPredictions);
    console.log(`📊 Total predictions in V2 contract: ${totalCountNumber}`);

    let blockchainStakes = 0;
    let redisStakes = 0;
    let missingStakes = 0;
    let syncedStakes = 0;
    const missingStakesList: any[] = [];
    const allBlockchainStakes: any[] = [];
    const allRedisStakes: any[] = [];

    // Check all predictions for this user's stakes
    for (let i = 1; i < totalCountNumber; i++) {
      try {
        // Get user's ETH stake from blockchain
        const ethStakeData = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'getUserStake',
          args: [BigInt(i), userId.toLowerCase() as `0x${string}`],
        }) as [bigint, bigint, boolean];

        const ethYesAmount = Number(ethStakeData[0]);
        const ethNoAmount = Number(ethStakeData[1]);
        const ethClaimed = ethStakeData[2];

        // Get user's SWIPE stake from blockchain
        const swipeStakeData = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'getUserStakeWithToken',
          args: [BigInt(i), userId.toLowerCase() as `0x${string}`],
        }) as [bigint, bigint, boolean];

        const swipeYesAmount = Number(swipeStakeData[0]);
        const swipeNoAmount = Number(swipeStakeData[1]);
        const swipeClaimed = swipeStakeData[2];

        // Check if user has any stakes in this prediction
        if (ethYesAmount > 0 || ethNoAmount > 0 || swipeYesAmount > 0 || swipeNoAmount > 0) {
          blockchainStakes++;

          // Get prediction data
          const predictionData = await publicClient.readContract({
            address: CONTRACTS.V2.address as `0x${string}`,
            abi: CONTRACTS.V2.abi,
            functionName: 'getPrediction',
            args: [BigInt(i)],
          });

          const [
            question,
            description,
            category,
            imageUrl,
            deadline,
            resolved,
            outcome,
            creator,
            verified,
            needsApproval,
            cancelled
          ] = predictionData as any[];

          const predictionId = `pred_v2_${i}`;

          const blockchainStake = {
            predictionId,
            predictionNumericId: i,
            question: String(question),
            ETH: {
              yesAmount: ethYesAmount,
              noAmount: ethNoAmount,
              claimed: ethClaimed
            },
            SWIPE: {
              yesAmount: swipeYesAmount,
              noAmount: swipeNoAmount,
              claimed: swipeClaimed
            },
            resolved: Boolean(resolved),
            outcome: Boolean(outcome),
            cancelled: Boolean(cancelled),
            deadline: Number(deadline)
          };

          allBlockchainStakes.push(blockchainStake);

          // Check if this stake exists in Redis
          const stakeKey = `user_stakes:${userId.toLowerCase()}:${predictionId}`;
          const redisStakeData = await redis.get(stakeKey);

          if (!redisStakeData) {
            // Stake missing in Redis
            missingStakes++;
            missingStakesList.push(blockchainStake);

            console.log(`❌ Missing stake in Redis for prediction ${i}:`, {
              ETH: `${ethYesAmount} YES, ${ethNoAmount} NO, claimed: ${ethClaimed}`,
              SWIPE: `${swipeYesAmount} YES, ${swipeNoAmount} NO, claimed: ${swipeClaimed}`
            });

            // Sync this stake to Redis
            try {
              const stakeData: any = {
                user: userId.toLowerCase(),
                predictionId: predictionId,
                stakedAt: Math.floor(Date.now() / 1000),
                contractVersion: 'V2'
              };

              // Add ETH stakes if any
              if (ethYesAmount > 0 || ethNoAmount > 0) {
                stakeData.ETH = {
                  yesAmount: ethYesAmount,
                  noAmount: ethNoAmount,
                  claimed: ethClaimed,
                  tokenType: 'ETH'
                };
              }

              // Add SWIPE stakes if any
              if (swipeYesAmount > 0 || swipeNoAmount > 0) {
                stakeData.SWIPE = {
                  yesAmount: swipeYesAmount,
                  noAmount: swipeNoAmount,
                  claimed: swipeClaimed,
                  tokenType: 'SWIPE'
                };
              }

              // Save to Redis
              await redis.set(stakeKey, JSON.stringify(stakeData));
              syncedStakes++;
              console.log(`✅ Synced missing stake to Redis for prediction ${i}`);
            } catch (syncError) {
              console.error(`❌ Failed to sync stake for prediction ${i}:`, syncError);
            }
          } else {
            redisStakes++;

            // Parse Redis stake
            const redisStake = typeof redisStakeData === 'string' ? JSON.parse(redisStakeData) : redisStakeData;
            allRedisStakes.push({
              predictionId,
              redisStake
            });

            // Check if Redis data matches blockchain data
            const ethMatches = redisStake.ETH?.yesAmount === ethYesAmount 
              && redisStake.ETH?.noAmount === ethNoAmount 
              && redisStake.ETH?.claimed === ethClaimed;

            const swipeMatches = redisStake.SWIPE?.yesAmount === swipeYesAmount 
              && redisStake.SWIPE?.noAmount === swipeNoAmount 
              && redisStake.SWIPE?.claimed === swipeClaimed;

            if (!ethMatches || !swipeMatches) {
              console.log(`⚠️ Stake data mismatch for prediction ${i}:`, {
                blockchain: blockchainStake,
                redis: redisStake
              });

              // Update Redis with blockchain data
              try {
                const stakeData: any = {
                  user: userId.toLowerCase(),
                  predictionId: predictionId,
                  stakedAt: redisStake.stakedAt || Math.floor(Date.now() / 1000),
                  contractVersion: 'V2'
                };

                if (ethYesAmount > 0 || ethNoAmount > 0) {
                  stakeData.ETH = {
                    yesAmount: ethYesAmount,
                    noAmount: ethNoAmount,
                    claimed: ethClaimed,
                    tokenType: 'ETH'
                  };
                }

                if (swipeYesAmount > 0 || swipeNoAmount > 0) {
                  stakeData.SWIPE = {
                    yesAmount: swipeYesAmount,
                    noAmount: swipeNoAmount,
                    claimed: swipeClaimed,
                    tokenType: 'SWIPE'
                  };
                }

                await redis.set(stakeKey, JSON.stringify(stakeData));
                syncedStakes++;
                console.log(`✅ Updated mismatched stake in Redis for prediction ${i}`);
              } catch (updateError) {
                console.error(`❌ Failed to update stake for prediction ${i}:`, updateError);
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Failed to check prediction ${i} for user ${userId}:`, error);
      }
    }

    console.log(`🎉 Blockchain sync completed for user ${userId}:`);
    console.log(`  📊 Total stakes in blockchain: ${blockchainStakes}`);
    console.log(`  📦 Total stakes in Redis: ${redisStakes}`);
    console.log(`  ❌ Missing/outdated stakes: ${missingStakes}`);
    console.log(`  ✅ Synced stakes: ${syncedStakes}`);

    return NextResponse.json({
      success: true,
      message: `Blockchain sync completed for user ${userId}`,
      data: {
        userId,
        blockchainStakes,
        redisStakes,
        missingStakes,
        syncedStakes,
        missingStakesList,
        allBlockchainStakes,
        allRedisStakes
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Blockchain sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync user data from blockchain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


