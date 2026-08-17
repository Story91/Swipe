import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers, redis, REDIS_KEYS } from '../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { RedisPrediction, RedisUserStake } from '../../../lib/types/redis';

interface ActivityItem {
  id: string;
  type: 'prediction_created' | 'bet_placed' | 'prediction_resolved' | 'payout_claimed' | 'prediction_approved' | 'user_joined';
  timestamp: number;
  user: {
    address: string;
    displayName: string;
    avatar?: string;
  };
  prediction?: {
    id: string;
    question: string;
    category: string;
  };
  details?: {
    amount?: number;
    choice?: 'YES' | 'NO';
    outcome?: 'YES' | 'NO';
    payout?: number;
    stake?: number;
  };
}

// GET /api/activity - Get recent activity
export async function GET(request: NextRequest) {
  try {
    // The feed is one chain's activity. Absent ?chain= means Base.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type'); // 'all', 'predictions', 'bets'

    const activities: ActivityItem[] = [];
    const avatars = ['🐋', '🎯', '🔮', '🐂', '👑', '🍀', '📈', '🤖', '⚽', '💻', '🚀', '💎'];

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions(chain);
    const consideredPredictions = allPredictions.slice(-100); // Last 100 for performance

    // Batch-read every stake up front. This used to be one redis.get per
    // participant inside a nested loop; against Upstash each is an HTTP round
    // trip, which measured at ~118s for this endpoint alone.
    const stakeKeys: string[] = [];
    for (const prediction of consideredPredictions) {
      for (const participant of prediction.participants || []) {
        // From REDIS_KEYS, so the key carries the chain prefix and matches the
        // one the lookup below builds.
        stakeKeys.push(REDIS_KEYS.USER_STAKES(participant, prediction.id, chain));
      }
    }

    const stakesByKey = new Map<string, unknown>();
    const STAKE_CHUNK = 100;
    for (let i = 0; i < stakeKeys.length; i += STAKE_CHUNK) {
      const chunk = stakeKeys.slice(i, i + STAKE_CHUNK);
      const rows = (await redis.mget(...chunk)) as unknown[];
      rows.forEach((row, index) => {
        if (row) stakesByKey.set(chunk[index], row);
      });
    }

    // Process predictions for activities
    for (const prediction of consideredPredictions) {
      // Prediction created activity
      if (prediction.creator) {
        activities.push({
          id: `pred_created_${prediction.id}`,
          type: 'prediction_created',
          timestamp: prediction.createdAt * 1000,
          user: {
            address: prediction.creator,
            displayName: `${prediction.creator.slice(0, 6)}...${prediction.creator.slice(-4)}`,
            avatar: avatars[Math.floor(Math.random() * avatars.length)]
          },
          prediction: {
            id: prediction.id,
            question: prediction.question,
            category: prediction.category
          }
        });
      }

      // Prediction resolved activity
      if (prediction.resolved && !prediction.cancelled) {
        const resolver = prediction.creator; // Assume creator resolves, in real app this would be stored
        activities.push({
          id: `pred_resolved_${prediction.id}`,
          type: 'prediction_resolved',
          timestamp: prediction.deadline * 1000 + 1000, // Just after deadline
          user: {
            address: resolver,
            displayName: `${resolver.slice(0, 6)}...${resolver.slice(-4)}`,
            avatar: avatars[Math.floor(Math.random() * avatars.length)]
          },
          prediction: {
            id: prediction.id,
            question: prediction.question,
            category: prediction.category
          },
          details: {
            outcome: prediction.outcome ? 'YES' : 'NO'
          }
        });
      }

      // Process stakes for this prediction
      for (const participant of prediction.participants) {
        const stakeKey = REDIS_KEYS.USER_STAKES(participant, prediction.id, chain);
        const stakeData = stakesByKey.get(stakeKey);

        if (stakeData) {
          const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
          // Stakes are stored per token: { user, stakedAt, ETH?: {...}, SWIPE?: {...} }.
          // This branch used to test for a top-level `yesAmount`, which the
          // multi-token shape does not have, so every bet and payout was
          // silently dropped from the feed.
          const legs = stake && typeof stake === 'object'
            ? [(stake as any).ETH, (stake as any).SWIPE].filter(Boolean)
            : [];

          if (legs.length > 0) {
            const yesAmount = legs.reduce((sum: number, leg: any) => sum + (Number(leg.yesAmount) || 0), 0);
            const noAmount = legs.reduce((sum: number, leg: any) => sum + (Number(leg.noAmount) || 0), 0);
            const userStake = {
              ...(stake as any),
              yesAmount,
              noAmount,
              // Claimed only when every leg the user holds has been claimed.
              claimed: legs.every((leg: any) => leg.claimed),
            } as RedisUserStake;
            const totalStake = yesAmount + noAmount;

            if (totalStake > 0) {
              // Bet placed activity
              activities.push({
                id: `bet_${participant}_${prediction.id}`,
                type: 'bet_placed',
                timestamp: userStake.stakedAt * 1000,
                user: {
                  address: participant,
                  displayName: `${participant.slice(0, 6)}...${participant.slice(-4)}`,
                  avatar: avatars[Math.floor(Math.random() * avatars.length)]
                },
                prediction: {
                  id: prediction.id,
                  question: prediction.question,
                  category: prediction.category
                },
                details: {
                  amount: totalStake,
                  choice: userStake.yesAmount > userStake.noAmount ? 'YES' : 'NO'
                }
              });

              // Payout claimed activity (if prediction is resolved and stake claimed)
              if (prediction.resolved && !prediction.cancelled && userStake.claimed) {
                const userChoice = userStake.yesAmount > userStake.noAmount;
                const winningStake = userChoice ? userStake.yesAmount : userStake.noAmount;

                if (userChoice === prediction.outcome && winningStake > 0) {
                  // Calculate payout
                  const losingPool = userChoice ? prediction.noTotalAmount : prediction.yesTotalAmount;
                  const winningPool = userChoice ? prediction.yesTotalAmount : prediction.noTotalAmount;
                  const payoutRatio = losingPool / winningPool;
                  const payout = winningStake * (1 + payoutRatio);

                  activities.push({
                    id: `payout_${participant}_${prediction.id}`,
                    type: 'payout_claimed',
                    timestamp: (prediction.deadline + 3600) * 1000, // 1 hour after resolution
                    user: {
                      address: participant,
                      displayName: `${participant.slice(0, 6)}...${participant.slice(-4)}`,
                      avatar: avatars[Math.floor(Math.random() * avatars.length)]
                    },
                    prediction: {
                      id: prediction.id,
                      question: prediction.question,
                      category: prediction.category
                    },
                    details: {
                      payout: payout,
                      stake: winningStake
                    }
                  });
                }
              }
            }
          }
        }
      }
    }

    // Sort by timestamp (most recent first) and limit
    const sortedActivities = activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    // Filter by type if specified
    let filteredActivities = sortedActivities;
    if (type) {
      switch (type) {
        case 'predictions':
          filteredActivities = sortedActivities.filter(a =>
            ['prediction_created', 'prediction_resolved', 'prediction_approved'].includes(a.type)
          );
          break;
        case 'bets':
          filteredActivities = sortedActivities.filter(a =>
            ['bet_placed', 'payout_claimed'].includes(a.type)
          );
          break;
      }
    }

    return NextResponse.json({
      success: true,
      data: filteredActivities,
      count: filteredActivities.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get activity:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch activity',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
