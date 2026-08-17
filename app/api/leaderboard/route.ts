import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { RedisPrediction } from '../../../lib/types/redis';
import { estimatePosition } from '@/lib/positionMath';
import { getFeeBps } from '@/lib/chains/fees';
import {
  stakeLegs,
  tokenMarket,
  legSides,
  emptyTotals,
  displayTotals,
  COLLATERAL_LEG,
  type StakeToken,
} from '@/lib/userStake';

/**
 * One row of the ranking.
 *
 * `totalProfit` and `totalStaked` are the collateral leg, in readable units,
 * and `totalsToken` says so. They were a sum across every token, which for a
 * ranking is not a rounding problem but a correctness one: positions are stored
 * raw, so one wei of ETH counted as much as a whole millionth of a dollar, and
 * a single dust ETH position outranked every real bet on the board.
 */
interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  avatar?: string;
  totalProfit: number;
  totalBets: number;
  winRate: number;
  totalStaked: number;
  /** Which token totalProfit and totalStaked are denominated in. */
  totalsToken: StakeToken;
  /** Every token's own totals, so the archived legs are still visible. */
  byToken: ReturnType<typeof displayTotals>;
  predictionsCreated: number;
}

// GET /api/leaderboard - Get leaderboard data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Profit is computed from one chain's pools, so the ranking is per chain.
    // Absent ?chain= means Base.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions(chain);

    // Filter by timeframe if needed
    let filteredPredictions = allPredictions;
    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
      const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
      filteredPredictions = allPredictions.filter(p => p.createdAt >= cutoffTime);
    }

    // One read per request, cached per chain. Written down instead, the obvious
    // literal is the contract's 1% constructor default rather than the 3% the
    // deploy script sets afterwards.
    const fees = await getFeeBps(chain);

    // Aggregate user statistics
    const userStats: { [address: string]: LeaderboardEntry } = {};

    // Get all unique users from predictions and stakes
    const allUsers = new Set<string>();

    // Add creators
    filteredPredictions.forEach(p => {
      if (p.creator) allUsers.add(p.creator);
    });

    // Add participants
    filteredPredictions.forEach(p => {
      p.participants.forEach(participant => allUsers.add(participant));
    });

    // Process each user
    for (const userAddress of allUsers) {
      // Get user's predictions
      const userPredictions = filteredPredictions.filter(p => p.creator === userAddress);
      const predictionsCreated = userPredictions.length;

      // Get user's stakes across all predictions
      const totals = emptyTotals();
      let wonBets = 0;
      let totalBets = 0;

      for (const prediction of filteredPredictions) {
        // Get user's stake for this prediction
        const stakeKey = REDIS_KEYS.USER_STAKES(userAddress, prediction.id, chain);
        const stakeData = await redis.get(stakeKey);
        if (!stakeData) continue;

        const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;

        // Same fault the portfolio had: the guard here was `'yesAmount' in
        // stake`, which only the flat V1 shape satisfies, so the board ranked
        // people on their V1 history and ignored every V2 and collateral
        // position they held.
        for (const l of stakeLegs(stake)) {
          const token = l.tokenType;
          const { choice, staked, backing } = legSides(l);
          const market = tokenMarket(prediction, token);

          totals[token].invested += staked;

          if (!market.resolved || market.cancelled) continue;
          totalBets++;

          if ((choice === 'YES') === market.outcome) {
            wonBets++;
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
            totals[token].profit += estimatePosition({
              mine: backing,
              myWeighted: usable ? myWeighted : backing,
              myWeightedPool: usable ? weightedPool : rawPool,
              losingPool: choice === 'YES' ? market.noPool : market.yesPool,
              platformFeeBps: fees.platform,
              creatorFeeBps: fees.creator,
            }).winnings;
          } else {
            totals[token].profit -= backing;
          }
        }
      }

      const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;

      // Generate display name from address
      const displayName = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

      const shown = displayTotals(totals);

      userStats[userAddress] = {
        rank: 0, // Will be set after sorting
        address: userAddress,
        displayName,
        avatar: getRandomAvatar(),
        totalProfit: shown[COLLATERAL_LEG].profit,
        totalBets,
        winRate,
        totalStaked: shown[COLLATERAL_LEG].invested,
        totalsToken: COLLATERAL_LEG,
        byToken: shown,
        predictionsCreated
      };
    }

    // Sort by profit and assign ranks
    const sortedUsers = Object.values(userStats)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, limit)
      .map((user, index) => ({
        ...user,
        rank: index + 1
      }));

    return NextResponse.json({
      success: true,
      data: sortedUsers,
      count: sortedUsers.length,
      timeframe,
      chain,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get leaderboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch leaderboard',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to generate random avatars
function getRandomAvatar(): string {
  const avatars = ['🐋', '🎯', '🔮', '🐂', '👑', '🍀', '📈', '🤖', '⚽', '💻', '🚀', '💎', '🎨', '🏆', '🎪'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}
