import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../lib/redis';
import { RedisUserStake, RedisPrediction } from '../../../lib/types/redis';

interface PortfolioItem {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  status: 'active' | 'won' | 'lost' | 'pending';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
  /**
   * The market's real deadline, unix seconds.
   *
   * Added because ActiveBets was showing a countdown derived from
   * `createdAt + 7 days`, a deadline no market actually has. In a betting app
   * an invented "3d 5h left" is worse than no countdown: it tells someone they
   * have time to change their mind on a market that may already be closed.
   */
  deadline: number;
  /** Both sides of the pool, so odds can be shown rather than assumed 50/50. */
  yesPool: number;
  noPool: number;
}

interface PortfolioStats {
  totalInvested: number;
  totalPayout: number;
  totalProfit: number;
  activeBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
}

// GET /api/portfolio - Get user portfolio data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'User address is required' },
        { status: 400 }
      );
    }

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();

    const portfolioItems: PortfolioItem[] = [];
    let totalInvested = 0;
    let totalPayout = 0;
    let totalProfit = 0;
    let activeBets = 0;
    let wonBets = 0;
    let lostBets = 0;

    // Process each prediction to find user's stakes
    for (const prediction of allPredictions) {
      const stakeKey = `user_stakes:${userAddress}:${prediction.id}`;
      const stakeData = await redis.get(stakeKey);

      if (stakeData) {
        const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
        if (stake && typeof stake === 'object' && 'yesAmount' in stake) {
          const userStake = stake as RedisUserStake;
          const stakeAmount = userStake.yesAmount + userStake.noAmount;

          if (stakeAmount > 0) {
            const choice = userStake.yesAmount > userStake.noAmount ? 'YES' : 'NO';
            const winningStake = choice === 'YES' ? userStake.yesAmount : userStake.noAmount;
            const losingStake = choice === 'YES' ? userStake.noAmount : userStake.yesAmount;

            // Determine status
            let status: 'active' | 'won' | 'lost' | 'pending' = 'pending';
            let potentialPayout = 0;
            let profit = 0;

            if (prediction.resolved && !prediction.cancelled) {
              // Prediction is resolved
              if (prediction.outcome === (choice === 'YES')) {
                // User won
                status = 'won';
                wonBets++;

                // Calculate actual payout
                const losingPool = choice === 'YES' ? prediction.noTotalAmount : prediction.yesTotalAmount;
                const winningPool = choice === 'YES' ? prediction.yesTotalAmount : prediction.noTotalAmount;

                if (winningPool > 0) {
                  const payoutRatio = losingPool / winningPool;
                  potentialPayout = winningStake * (1 + payoutRatio);
                  profit = potentialPayout - stakeAmount;
                }
              } else {
                // User lost
                status = 'lost';
                lostBets++;
                potentialPayout = 0;
                profit = -stakeAmount;
              }
            } else if (!prediction.resolved && prediction.deadline > Date.now() / 1000) {
              // Prediction is still active
              status = 'active';
              activeBets++;

              // Calculate potential payout for active predictions
              const losingPool = choice === 'YES' ? prediction.noTotalAmount : prediction.yesTotalAmount;
              const winningPool = choice === 'YES' ? prediction.yesTotalAmount : prediction.noTotalAmount;

              if (winningPool > 0) {
                const payoutRatio = losingPool / winningPool;
                potentialPayout = winningStake * (1 + payoutRatio);
                profit = potentialPayout - stakeAmount;
              }
            }

            totalInvested += stakeAmount;
            totalPayout += potentialPayout;
            totalProfit += profit;

            portfolioItems.push({
              id: prediction.id,
              question: prediction.question,
              category: prediction.category,
              stakeAmount,
              choice,
              status,
              potentialPayout,
              profit,
              createdAt: userStake.stakedAt,
              imageUrl: prediction.imageUrl || 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop',
              deadline: prediction.deadline,
              yesPool: prediction.yesTotalAmount,
              noPool: prediction.noTotalAmount
            });
          }
        }
      }
    }

    const winRate = wonBets + lostBets > 0 ? (wonBets / (wonBets + lostBets)) * 100 : 0;

    const stats: PortfolioStats = {
      totalInvested,
      totalPayout,
      totalProfit,
      activeBets,
      wonBets,
      lostBets,
      winRate
    };

    return NextResponse.json({
      success: true,
      data: {
        portfolio: portfolioItems,
        stats
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get portfolio:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch portfolio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
