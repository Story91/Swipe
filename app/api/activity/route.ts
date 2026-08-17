import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers, redis, REDIS_KEYS } from '../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { RedisPrediction } from '../../../lib/types/redis';
import { estimatePosition } from '@/lib/positionMath';
import { getFeeBps } from '@/lib/chains/fees';
import {
  stakeLegs,
  tokenMarket,
  legSides,
  toDisplayUnits,
  type StakeToken,
} from '@/lib/userStake';

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
    /** Readable units of `token`, not raw. The feed used to print wei. */
    amount?: number;
    /**
     * What `amount` and `payout` are denominated in.
     *
     * The feed hardcoded "ETH" next to every figure. On a collateral market
     * that label is simply wrong, and a bet of 25 USDG was announced as an ETH
     * position of twenty five million million million.
     */
    token?: StakeToken;
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

    // One read per request, cached per chain. Written down instead, the obvious
    // literal is the contract's 1% constructor default rather than the 3% the
    // deploy script sets afterwards.
    const fees = await getFeeBps(chain);

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

          // One entry per token, rather than one entry with the tokens added up.
          //
          // This block was fixed once already, when it tested for a top-level
          // `yesAmount` that the multi-token shape does not have and dropped
          // every bet from the feed. The fix hardcoded ETH and SWIPE and summed
          // them, so the collateral leg stayed invisible and two different
          // currencies were reported as one figure. stakeLegs knows all three
          // and a new one arrives here without another edit.
          const who = `${participant.slice(0, 6)}...${participant.slice(-4)}`;

          for (const l of stakeLegs(stake)) {
            const token = l.tokenType;
            const { choice, staked, backing } = legSides(l);
            const market = tokenMarket(prediction, token);

            activities.push({
              id: `bet_${participant}_${prediction.id}_${token}`,
              type: 'bet_placed',
              timestamp: l.stakedAt * 1000,
              user: {
                address: participant,
                displayName: who,
                avatar: avatars[Math.floor(Math.random() * avatars.length)]
              },
              prediction: {
                id: prediction.id,
                question: prediction.question,
                category: prediction.category
              },
              details: {
                amount: toDisplayUnits(staked, token),
                token,
                choice
              }
            });

            // Payout claimed activity (if this leg is settled and claimed)
            if (!market.resolved || market.cancelled || !l.claimed) continue;
            if ((choice === 'YES') !== market.outcome || backing <= 0) continue;

          /**
           * The contract's own arithmetic, not a pro rata guess.
           *
           * Two errors, both overstating. No fee was taken, although the
           * contract removes the platform and creator cuts from the losing pool
           * first. And the share was over the raw pool rather than the weighted
           * one, which hands a late bet what an early bet paid for. On a
           * ranking that is not a rounding difference, it is the order.
           */
            const weightedPool =
              choice === 'YES' ? market.weightedYesPool : market.weightedNoPool;
            const myWeighted = choice === 'YES' ? (l.weightedYes ?? 0) : (l.weightedNo ?? 0);
            const usable = weightedPool > 0 && myWeighted > 0;
            const rawPool = choice === 'YES' ? market.yesPool : market.noPool;
            if (!usable && rawPool <= 0) continue;
            const payout = estimatePosition({
              mine: backing,
              myWeighted: usable ? myWeighted : backing,
              myWeightedPool: usable ? weightedPool : rawPool,
              losingPool: choice === 'YES' ? market.noPool : market.yesPool,
              platformFeeBps: fees.platform,
              creatorFeeBps: fees.creator,
            }).total;

            activities.push({
              id: `payout_${participant}_${prediction.id}_${token}`,
              type: 'payout_claimed',
              timestamp: (prediction.deadline + 3600) * 1000, // 1 hour after resolution
              user: {
                address: participant,
                displayName: who,
                avatar: avatars[Math.floor(Math.random() * avatars.length)]
              },
              prediction: {
                id: prediction.id,
                question: prediction.question,
                category: prediction.category
              },
              details: {
                payout: toDisplayUnits(payout, token),
                stake: toDisplayUnits(backing, token),
                token
              }
            });
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
