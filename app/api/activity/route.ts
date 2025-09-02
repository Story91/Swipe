import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers, RedisPrediction, RedisUserStake } from '../../../lib/redis';

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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type'); // 'all', 'predictions', 'bets'

    const activities: ActivityItem[] = [];
    const avatars = ['🐋', '🎯', '🔮', '🐂', '👑', '🍀', '📈', '🤖', '⚽', '💻', '🚀', '💎'];

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();

    // Process predictions for activities
    for (const prediction of allPredictions.slice(-100)) { // Last 100 predictions for performance
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
        const stakeKey = `user_stakes:${participant}:${prediction.id}`;
        const stakeData = await redis.get(stakeKey);

        if (stakeData) {
          const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
          if (stake && typeof stake === 'object' && 'yesAmount' in stake) {
            const userStake = stake as RedisUserStake;
            const totalStake = userStake.yesAmount + userStake.noAmount;

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
