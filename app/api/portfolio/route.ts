import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { RedisPrediction } from '../../../lib/types/redis';
import {
  stakeLegs,
  tokenMarket,
  legSides,
  toDisplayUnits,
  emptyTotals,
  displayTotals,
  COLLATERAL_LEG,
  type StakeToken,
} from '@/lib/userStake';

interface PortfolioItem {
  id: string;
  question: string;
  category: string;
  /** In `token`'s own readable units, not raw and not always ETH. */
  stakeAmount: number;
  /**
   * Which token this row is denominated in.
   *
   * A market can hold a position in more than one, so a user gets one row per
   * token rather than one per market. Without this the UI has no way to know
   * whether `stakeAmount: 25` means 25 dollars or 25 ETH.
   */
  token: StakeToken;
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
  /**
   * How the market actually settled, once it has. Undefined while it is still
   * running.
   *
   * Added because BetHistory was deriving the outcome from the user's own
   * choice, which made every settled row claim the user had called it right,
   * including the ones it simultaneously labelled "lost".
   */
  outcome?: 'YES' | 'NO';
}

/**
 * Headline numbers.
 *
 * The three money fields are the COLLATERAL totals, in readable units, and they
 * say so rather than being a sum across tokens. Adding tokens together cannot
 * be done honestly: positions are stored raw, one ETH is 1e18 and one USDC is
 * 1e6, so a single figure is just the wei leg with a rounding error attached.
 *
 * Collateral is the one that gets the headline because it is the live product.
 * ETH and SWIPE positions live on contracts nobody can settle any more, and
 * they are still reported, under byToken.
 *
 * The counts are deliberately across all tokens: "how many open bets" and "what
 * share did I call right" are questions about the user, not about a currency.
 */
interface PortfolioStats {
  totalInvested: number;
  totalPayout: number;
  totalProfit: number;
  /** Which token the three figures above are in. */
  totalsToken: StakeToken;
  /** Every token's own totals, in readable units. Nothing is summed across. */
  byToken: ReturnType<typeof displayTotals>;
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

    // A portfolio is one chain's positions. Absent ?chain= means Base.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions(chain);

    const portfolioItems: PortfolioItem[] = [];
    const totals = emptyTotals();
    let activeBets = 0;
    let wonBets = 0;
    let lostBets = 0;

    // Process each prediction to find user's stakes
    for (const prediction of allPredictions) {
      // Built from REDIS_KEYS rather than spelled out, so it carries the chain
      // prefix. A literal here reads Base's stakes whatever chain was asked for.
      const stakeKey = REDIS_KEYS.USER_STAKES(userAddress, prediction.id, chain);
      const stakeData = await redis.get(stakeKey);
      if (!stakeData) continue;

      const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;

      // One row per token, not one per market.
      //
      // This loop used to open with `if ('yesAmount' in stake)`, which only the
      // flat V1 shape satisfies. Every record written since nests its amounts
      // under a token key, so the whole of V2 and every collateral position
      // failed that test and was skipped without a trace. The portfolio was
      // reporting on V1 records and presenting the result as the user's
      // holdings.
      for (const l of stakeLegs(stake)) {
        const token = l.tokenType;
        const { choice, staked, backing } = legSides(l);

        // The pools and settlement flags for THIS token. Reading a collateral
        // position against yesTotalAmount, the ETH pool, builds a payout ratio
        // out of two unrelated markets.
        const market = tokenMarket(prediction, token);

        let status: 'active' | 'won' | 'lost' | 'pending' = 'pending';
        let potentialPayout = 0;
        let profit = 0;

        /** Parimutuel: your side splits the other side, pro rata. */
        const payoutOn = () => {
          const losingPool = choice === 'YES' ? market.noPool : market.yesPool;
          const winningPool = choice === 'YES' ? market.yesPool : market.noPool;
          if (winningPool <= 0) return;
          potentialPayout = backing * (1 + losingPool / winningPool);
          profit = potentialPayout - staked;
        };

        if (market.resolved && !market.cancelled) {
          if (market.outcome === (choice === 'YES')) {
            status = 'won';
            wonBets++;
            payoutOn();
          } else {
            status = 'lost';
            lostBets++;
            profit = -staked;
          }
        } else if (!market.resolved && prediction.deadline > Date.now() / 1000) {
          status = 'active';
          activeBets++;
          payoutOn();
        }

        totals[token].invested += staked;
        totals[token].payout += potentialPayout;
        totals[token].profit += profit;
        totals[token].bets += 1;

        portfolioItems.push({
          id: prediction.id,
          question: prediction.question,
          category: prediction.category,
          // Readable units, per token, so the UI is not left dividing by a
          // decimal count it would have to guess.
          stakeAmount: toDisplayUnits(staked, token),
          token,
          choice,
          status,
          potentialPayout: toDisplayUnits(potentialPayout, token),
          profit: toDisplayUnits(profit, token),
          createdAt: l.stakedAt,
          imageUrl: prediction.imageUrl || 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop',
          deadline: prediction.deadline,
          yesPool: toDisplayUnits(market.yesPool, token),
          noPool: toDisplayUnits(market.noPool, token),
          outcome: market.resolved ? (market.outcome ? 'YES' : 'NO') : undefined,
        });
      }
    }

    const winRate = wonBets + lostBets > 0 ? (wonBets / (wonBets + lostBets)) * 100 : 0;
    const shown = displayTotals(totals);

    const stats: PortfolioStats = {
      // The collateral leg, named rather than implied. See PortfolioStats.
      totalInvested: shown[COLLATERAL_LEG].invested,
      totalPayout: shown[COLLATERAL_LEG].payout,
      totalProfit: shown[COLLATERAL_LEG].profit,
      totalsToken: COLLATERAL_LEG,
      byToken: shown,
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
