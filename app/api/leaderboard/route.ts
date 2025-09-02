import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, RedisUserStake, RedisPrediction } from '../../../lib/redis';

interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  avatar?: string;
  totalProfit: number;
  totalBets: number;
  winRate: number;
  totalStaked: number;
  predictionsCreated: number;
}

// GET /api/leaderboard - Get leaderboard data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();

    // Filter by timeframe if needed
    let filteredPredictions = allPredictions;
    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
      const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
      filteredPredictions = allPredictions.filter(p => p.createdAt >= cutoffTime);
    }

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
      let totalStaked = 0;
      let totalProfit = 0;
      let wonBets = 0;
      let totalBets = 0;

      for (const prediction of filteredPredictions) {
        // Get user's stake for this prediction
        const stakeKey = `user_stakes:${userAddress}:${prediction.id}`;
        const stakeData = await redis.get(stakeKey);

        if (stakeData) {
          const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
          if (stake && typeof stake === 'object' && 'yesAmount' in stake) {
            const userStake = stake as RedisUserStake;
            const stakeAmount = userStake.yesAmount + userStake.noAmount;
            totalStaked += stakeAmount;

            if (prediction.resolved && !prediction.cancelled) {
              totalBets++;

              // Check if user won
              const userChoice = userStake.yesAmount > userStake.noAmount ? true : false;
              if (userChoice === prediction.outcome) {
                wonBets++;

                // Calculate profit for winning bet
                const winningStake = userChoice ? userStake.yesAmount : userStake.noAmount;
                const losingPool = userChoice ? prediction.noTotalAmount : prediction.yesTotalAmount;
                const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;

                if (totalPool > 0) {
                  const profitRatio = losingPool / (userChoice ? prediction.yesTotalAmount : prediction.noTotalAmount);
                  const profit = winningStake * profitRatio;
                  totalProfit += profit;
                }
              } else {
                // Loss - subtract the losing stake amount
                const losingStake = userChoice ? userStake.yesAmount : userStake.noAmount;
                totalProfit -= losingStake;
              }
            }
          }
        }
      }

      const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;

      // Generate display name from address
      const displayName = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

      userStats[userAddress] = {
        rank: 0, // Will be set after sorting
        address: userAddress,
        displayName,
        avatar: getRandomAvatar(),
        totalProfit,
        totalBets,
        winRate,
        totalStaked,
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
