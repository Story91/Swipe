import type { RedisPrediction } from '@/lib/types/redis';
import { estimatePosition } from '@/lib/positionMath';
import {
  COLLATERAL_LEG,
  displayTotals,
  emptyTotals,
  legSides,
  tokenMarket,
  type StakeLeg,
  type StakeToken,
  type TokenTotals,
} from '@/lib/userStake';

/**
 * The numbers the P&L share card prints, kept out of the renderer so they can
 * be tested without a Redis, a chain or an ImageResponse.
 *
 * The card this replaces did the arithmetic inline and did it across tokens. It
 * ran `totalStaked += yesAmount + noAmount` over every leg a user held, then
 * divided the one total by 1e18 and wrote "ETH" after it. A stake is stored raw
 * in its own token's base units, so one dollar of collateral is 1000000 and one
 * ETH is 1000000000000000000: adding them and scaling by 1e18 leaves the wei
 * leg with a rounding error attached, and labels it with a token the user may
 * never have held. Somebody holding nothing but a 25 dollar bet had their whole
 * portfolio published to a public feed as "0.00000000 ETH", which reads as a
 * broken app rather than as a card that added the wrong things.
 *
 * So nothing here is summed across tokens. Totals are kept per token, one of
 * them is chosen as the headline, and the card has to name it. This is the same
 * rule /api/portfolio follows, and the payout comes from the same
 * estimatePosition the swipe card and the portfolio use, so the share image and
 * the app cannot disagree about what a position is worth.
 */

/** One leg of one market, which is the unit the totals are built from. */
export interface PnlPosition {
  prediction: RedisPrediction;
  leg: StakeLeg;
}

/** The fee rates the payout is net of. Read from the chain, never guessed. */
export interface PnlFees {
  platformBps: number;
  creatorBps: number;
}

export interface PnlFigures {
  /** Every token's own totals, in readable units. Nothing is summed across. */
  byToken: TokenTotals;
  /**
   * The token the three headline figures are in.
   *
   * Collateral when the user holds any, because that is the live product.
   * Otherwise the archived leg they actually have, so a wallet that only ever
   * bet ETH still gets a card with real numbers on it rather than three zeros.
   */
  headline: StakeToken;
  /** Headline token, readable units. */
  staked: number;
  payout: number;
  profit: number;
  /** Percent, of the headline token only. A ratio inside one token is safe. */
  roi: number;
  /** Counts are across every token: they are about the user, not a currency. */
  wins: number;
  losses: number;
  bets: number;
  /** Tokens with a position that the headline is not naming. */
  others: StakeToken[];
}

/** Collateral first, then the archived legs, in a fixed order. */
const HEADLINE_ORDER: readonly StakeToken[] = [COLLATERAL_LEG, 'ETH', 'SWIPE'];

/**
 * Totals per token, plus the win and loss counts.
 *
 * The branch structure is lifted from /api/portfolio deliberately, so the two
 * agree row for row. In particular a market that is past its deadline and not
 * yet resolved contributes its stake and nothing else. The old card booked it
 * as a total loss, which told a user they were down on a market that had not
 * been called yet.
 */
export function pnlFigures(
  positions: PnlPosition[],
  fees: PnlFees,
  nowSeconds: number = Date.now() / 1000
): PnlFigures {
  const totals = emptyTotals();
  let wins = 0;
  let losses = 0;
  let bets = 0;

  for (const { prediction, leg } of positions) {
    const token = leg.tokenType;
    const { choice, staked, backing } = legSides(leg);
    if (staked <= 0) continue;

    // This token's pools and this token's settlement flags. The collateral
    // contract is a different contract from the archived one and settles on its
    // own schedule, so reading a collateral position against yesTotalAmount
    // builds a payout out of two unrelated markets.
    const market = tokenMarket(prediction, token);

    let payout = 0;
    let profit = 0;

    const settleWon = () => {
      const weightedPool = choice === 'YES' ? market.weightedYesPool : market.weightedNoPool;
      const myWeighted = choice === 'YES' ? (leg.weightedYes ?? 0) : (leg.weightedNo ?? 0);
      // The archived legs never had time weighting, and a collateral market
      // synced before it was recorded has none either. Falling back to the raw
      // stake keeps the fee right and leaves the share unweighted, which beats
      // dividing by zero.
      const weighted = weightedPool > 0 && myWeighted > 0;
      const estimate = estimatePosition({
        mine: backing,
        myWeighted: weighted ? myWeighted : backing,
        myWeightedPool: weighted
          ? weightedPool
          : choice === 'YES'
            ? market.yesPool
            : market.noPool,
        losingPool: choice === 'YES' ? market.noPool : market.yesPool,
        platformFeeBps: fees.platformBps,
        creatorFeeBps: fees.creatorBps,
      });
      payout = estimate.total;
      profit = estimate.total - staked;
    };

    if (market.resolved && !market.cancelled) {
      if (market.outcome === (choice === 'YES')) {
        wins++;
        settleWon();
      } else {
        losses++;
        profit = -staked;
      }
    } else if (!market.resolved && prediction.deadline > nowSeconds) {
      settleWon();
    }

    totals[token].invested += staked;
    totals[token].payout += payout;
    totals[token].profit += profit;
    totals[token].bets += 1;
    bets++;
  }

  const byToken = displayTotals(totals);
  const headline =
    HEADLINE_ORDER.find((token) => byToken[token].bets > 0) ?? COLLATERAL_LEG;
  const head = byToken[headline];
  const others = HEADLINE_ORDER.filter((token) => token !== headline && byToken[token].bets > 0);

  return {
    byToken,
    headline,
    staked: head.invested,
    payout: head.payout,
    profit: head.profit,
    roi: head.invested > 0 ? (head.profit / head.invested) * 100 : 0,
    wins,
    losses,
    bets,
    others,
  };
}

/**
 * An amount in the shape its own token is read in.
 *
 * Three tokens, three habits. Collateral is money and is quoted to the cent,
 * ETH needs enough decimals that a small bet is not rounded to nothing, and
 * SWIPE is counted in the millions. One formatter with a 1e18 divisor baked in
 * was how the old card printed a 25 dollar position as zero.
 */
export function formatLegAmount(amount: number, token: StakeToken): string {
  const value = Math.abs(amount);

  if (token === 'SWIPE') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toFixed(0);
  }

  if (token === 'ETH') {
    if (value >= 1) return value.toFixed(4);
    if (value >= 0.01) return value.toFixed(6);
    return value.toFixed(8);
  }

  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(2);
}
