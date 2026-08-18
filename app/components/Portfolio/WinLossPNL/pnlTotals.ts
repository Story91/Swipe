import { toDisplayUnits, COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';

/**
 * The arithmetic behind the P&L card.
 *
 * It sits beside the component rather than inside it because a .tsx cannot be
 * tested here: vitest collects test files under lib and app, and tsconfig
 * leaves jsx as preserve, so importing the component into a test never
 * compiles. Anything that decides a number a user reads as their money lives in
 * this file instead, where a test can reach it.
 *
 * Two rules run through all of it.
 *
 * Nothing is added across tokens. A stake is stored raw, in the token's own
 * base units, so one ETH is 1e18 and one dollar of collateral is 1e6. A single
 * "total staked" over both is the wei leg with a rounding error stapled to it.
 * Every figure here belongs to one token, and the caller has to name which.
 *
 * No payout is worked out here. A leg arrives with its payout already settled
 * by whoever read the pools, through estimatePosition in lib/positionMath, at
 * the fee rates of the contract that position is actually on. That is 100 bps
 * and no creator cut on the archived V2 markets, and whatever getFeeConfig
 * reports on the live one, 300 plus 50 today. Recomputing it here at some
 * blended rate would give the card a second opinion about the same position,
 * and the card is not the thing holding the money.
 */

/** One token's position on one market, raw, in that token's base units. */
export interface PnlStakeLeg {
  yesAmount: number;
  noAmount: number;
  /** Stake plus winnings if this side is right. Zero once it is wrong. */
  potentialPayout: number;
  /** Payout less stake, so a settled loss is negative. */
  potentialProfit: number;
  isWinner: boolean;
}

/**
 * A market the user is in, with one leg per token they hold it in.
 *
 * The collateral leg carries its own settlement flags because it lives on a
 * different contract from the archived ETH and SWIPE pools and resolves on its
 * own schedule. Same reasoning as tokenMarket in lib/userStake, and the same
 * field names, because these come straight off the Redis record.
 */
export interface PnlPrediction {
  id: string;
  question: string;
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  usdcResolved?: boolean;
  usdcCancelled?: boolean;
  usdcOutcome?: boolean;
  userStakes?: Partial<Record<StakeToken, PnlStakeLeg>>;
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
}

/** One token's running totals, in units a person reads. */
export interface PnlSummary {
  token: StakeToken;
  /** Everything put in, in `token`. Never a sum over other tokens. */
  staked: number;
  payout: number;
  profit: number;
  /** Profit over stake as a percentage, which is unit free. */
  roi: number;
  bets: number;
  wins: number;
  losses: number;
}

/**
 * Whether this token's market has settled, and how.
 *
 * A market can be resolved on the collateral contract and still open on the V2
 * one, or the reverse. Counting a collateral position as decided because the
 * archived pool beside it was resolved marks a live bet as a loss.
 */
export function settlementOf(
  prediction: PnlPrediction,
  token: StakeToken
): { resolved: boolean; cancelled: boolean } {
  if (token === COLLATERAL_LEG) {
    return {
      resolved: prediction.usdcResolved ?? prediction.status === 'resolved',
      cancelled: prediction.usdcCancelled ?? prediction.cancelled,
    };
  }
  return {
    resolved: prediction.status === 'resolved',
    cancelled: prediction.cancelled,
  };
}

/**
 * Every leg, collateral first, in one fixed order so two callers never
 * disagree about precedence.
 */
export const PNL_TOKENS: readonly StakeToken[] = [COLLATERAL_LEG, 'ETH', 'SWIPE'];

/**
 * Which way one market went for this user, over every token they held it in.
 *
 * Both can be true. A market can hold a collateral position that came in and an
 * archived SWIPE position on the other side of the same question, and a screen
 * that lists wins and losses separately should show it in both places rather
 * than pick one and drop the other.
 */
export function recordOn(prediction: PnlPrediction): { won: boolean; lost: boolean } {
  let won = false;
  let lost = false;

  for (const token of PNL_TOKENS) {
    const leg = prediction.userStakes?.[token];
    if (!leg) continue;
    if ((leg.yesAmount || 0) + (leg.noAmount || 0) <= 0) continue;

    const settled = settlementOf(prediction, token);
    if (!settled.resolved || settled.cancelled) continue;

    if (leg.isWinner) won = true;
    else lost = true;
  }

  return { won, lost };
}

/**
 * The side that won, on the contract this token settles on.
 *
 * Undefined while that contract still has the market open. The collateral one
 * carries its own flag for the same reason it carries its own resolved flag:
 * it is a different contract and it can call a market the archived pool has not
 * been told about yet.
 */
export function outcomeOf(prediction: PnlPrediction, token: StakeToken): boolean | undefined {
  const settled = settlementOf(prediction, token);
  if (!settled.resolved) return undefined;
  if (token === COLLATERAL_LEG) return prediction.usdcOutcome ?? prediction.outcome;
  return prediction.outcome;
}

/**
 * One token's totals across every market the user holds it in.
 *
 * Raw amounts are summed first and converted once, so the division by the
 * token's decimals happens a single time rather than per row.
 *
 * A leg with nothing on either side is skipped rather than counted as a bet.
 * A sync that reads two tokens and finds one writes a zeroed leg for the other,
 * and treating that as a position inflates the bet count and drags the record
 * towards a market the user never entered.
 */
export function summarisePnl(
  predictions: readonly PnlPrediction[],
  token: StakeToken
): PnlSummary {
  let staked = 0;
  let payout = 0;
  let profit = 0;
  let bets = 0;
  let wins = 0;
  let losses = 0;

  for (const prediction of predictions) {
    const leg = prediction.userStakes?.[token];
    if (!leg) continue;

    const legStaked = (leg.yesAmount || 0) + (leg.noAmount || 0);
    if (legStaked <= 0) continue;

    staked += legStaked;
    payout += leg.potentialPayout || 0;
    profit += leg.potentialProfit || 0;
    bets += 1;

    const settled = settlementOf(prediction, token);
    // A cancelled market hands every side its own stake back, so it is neither
    // a win nor a loss and belongs in no record.
    if (settled.resolved && !settled.cancelled) {
      if (leg.isWinner) wins += 1;
      else losses += 1;
    }
  }

  return {
    token,
    staked: toDisplayUnits(staked, token),
    payout: toDisplayUnits(payout, token),
    profit: toDisplayUnits(profit, token),
    roi: staked > 0 ? (profit / staked) * 100 : 0,
    bets,
    wins,
    losses,
  };
}

/** Rounded to `places`, so a value that rounds to nothing loses its minus. */
function signOf(amount: number, places: number): { sign: string; abs: number } {
  const factor = 10 ** places;
  const rounded = Math.round(amount * factor) / factor;
  return { sign: rounded < 0 ? '-' : '', abs: Math.abs(rounded) };
}

/** Dollars, to the cent, because that is the unit the bet was placed in. */
function formatStable(amount: number): string {
  const { sign, abs } = signOf(amount, 2);
  return (
    sign +
    abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function formatEth(amount: number): string {
  const { sign, abs } = signOf(amount, 6);
  return sign + abs.toFixed(6);
}

/** Millions of SWIPE are ordinary, so the big end gets abbreviated. */
function formatSwipe(amount: number): string {
  const { sign, abs } = signOf(amount, 4);
  if (abs === 0) return '0';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `${sign}${abs.toFixed(2)}`;
  return `${sign}${abs.toFixed(4)}`;
}

/**
 * An amount already in display units, printed the way its token is read.
 *
 * The token decides the precision, not the screen. Six places on a wei token
 * and two on the collateral, because a cent is the smallest thing a dollar bet
 * can move by and six zeros after a dollar sign only looks precise.
 */
export function formatTokenAmount(amount: number, token: StakeToken): string {
  if (token === COLLATERAL_LEG) return formatStable(amount);
  if (token === 'SWIPE') return formatSwipe(amount);
  return formatEth(amount);
}

/** The same, with a plus in front when there is a gain to show. */
export function formatSignedAmount(amount: number, token: StakeToken): string {
  const text = formatTokenAmount(amount, token);
  return amount > 0 && !text.startsWith('-') ? `+${text}` : text;
}

export function formatRoi(roi: number): string {
  const rounded = Math.round(roi);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
