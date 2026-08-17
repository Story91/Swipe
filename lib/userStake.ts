import type { RedisPrediction } from './types/redis';
import { getChainConfig } from './chains';
import type { ChainKey } from './chains/types';

/**
 * Reading a stored position, in one place, because four routes were each
 * reading it differently and three of them were wrong.
 *
 * A stake record in Redis has two shapes. V1 wrote the position flat, with
 * yesAmount and noAmount at the top level. Everything since writes one nested
 * object per token: `{ user, predictionId, stakedAt, ETH: {...}, SWIPE: {...} }`
 * for V2, and the collateral leg under `USDC` for V3 and V4.
 *
 * What that cost:
 *
 *  - /api/portfolio and /api/leaderboard both tested `'yesAmount' in stake` and
 *    skipped anything that failed it. Every nested record fails it, so both were
 *    blind to all 245 V2 markets AND to every collateral position. They were
 *    reporting on V1 records only, and reading as though that were the whole
 *    portfolio.
 *  - /api/activity was fixed for ETH and SWIPE and never gained the third leg.
 *  - /api/stakes flattens ETH and SWIPE in three separate copies of the same
 *    block, none of which mention the collateral.
 *
 * So the shape is decoded once, here, and a new token leg is added in one place
 * rather than four.
 */

/** The tokens a position can be held in. `USDC` is the collateral leg. */
export type StakeToken = 'ETH' | 'SWIPE' | 'USDC';

/**
 * The key the collateral leg is stored under, which is the literal 'USDC' on
 * every chain including Robinhood, where the token is actually USDG.
 *
 * Not renamed. The name is in live Redis records and the sync route writes it,
 * so changing it here would orphan every position already stored. What the leg
 * is called and what the token is called are different questions; ask the chain
 * config for the second one.
 */
export const COLLATERAL_LEG: StakeToken = 'USDC';

/** Legs in a fixed order, so two callers never disagree about precedence. */
const LEGS: readonly StakeToken[] = ['ETH', 'SWIPE', 'USDC'];

/**
 * Decimals per leg, for turning a raw on-chain integer into something a person
 * can read.
 *
 * These matter more than they look. Pools and positions are both stored raw, so
 * a ratio between them is unit free and payout maths is safe per token. Adding
 * across tokens is not: one raw ETH is 1e18 and one raw USDC is 1e6, so a single
 * summed "total invested" is dominated entirely by whichever leg is denominated
 * in wei. That is why nothing here returns one number across tokens.
 */
const DECIMALS: Record<StakeToken, number> = { ETH: 18, SWIPE: 18, USDC: 6 };

/** One token's position on one market. */
export interface StakeLeg {
  user: string;
  predictionId: string;
  /** Raw, in the token's own base units. */
  yesAmount: number;
  /** Raw, in the token's own base units. */
  noAmount: number;
  claimed: boolean;
  stakedAt: number;
  contractVersion?: string;
  tokenType: StakeToken;
  /**
   * The stake after the contract's time weighting, raw, in the same units.
   *
   * Only the collateral leg has one: /api/sync/usdc reads it off positions(id,
   * user) and the archived contracts had no weighting at all. Zero means "not
   * recorded", and a payout that divides by weight has to fall back to the raw
   * stake rather than dividing by nothing.
   */
  weightedYes?: number;
  weightedNo?: number;
}

function leg(
  raw: Record<string, unknown>,
  token: StakeToken,
  nested: Record<string, unknown>
): StakeLeg {
  return {
    user: String(raw.user ?? ''),
    predictionId: String(raw.predictionId ?? ''),
    yesAmount: Number(nested.yesAmount) || 0,
    noAmount: Number(nested.noAmount) || 0,
    claimed: Boolean(nested.claimed),
    stakedAt: Number(raw.stakedAt) || 0,
    contractVersion: raw.contractVersion as string | undefined,
    tokenType: token,
    weightedYes: Number(nested.weightedYes) || 0,
    weightedNo: Number(nested.weightedNo) || 0,
  };
}

/**
 * Every non-empty leg in a stored stake record, whichever shape it is in.
 *
 * Empty legs are dropped rather than returned as zeros. A record can carry a
 * `SWIPE: { yesAmount: 0, noAmount: 0 }` from a sync that read both tokens and
 * found one, and counting that as a position inflates the bet count and drags
 * the win rate towards a market the user never entered.
 */
export function stakeLegs(raw: unknown): StakeLeg[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  if (!('user' in record)) return [];

  const nestedLegs = LEGS.filter((token) => {
    const value = record[token];
    return Boolean(value) && typeof value === 'object';
  });

  if (nestedLegs.length > 0) {
    return nestedLegs
      .map((token) => leg(record, token, record[token] as Record<string, unknown>))
      .filter((l) => l.yesAmount > 0 || l.noAmount > 0);
  }

  // The flat V1 shape. Those positions are always ETH, and the record carries
  // no token field to say so.
  if (!('yesAmount' in record)) return [];
  const flat = leg(record, 'ETH', record);
  flat.contractVersion = (record.contractVersion as string | undefined) ?? 'V1';
  return flat.yesAmount > 0 || flat.noAmount > 0 ? [flat] : [];
}

/** A raw amount in the units a person reads. */
export function toDisplayUnits(amount: number, token: StakeToken): number {
  return amount / 10 ** DECIMALS[token];
}

/**
 * What to print next to an amount, for a given chain.
 *
 * The collateral leg is stored under the key 'USDC' everywhere, including
 * Robinhood, where the token is Paxos USDG. Printing the leg name would tell a
 * Robinhood user they hold dollars of the wrong brand, so the symbol comes from
 * the chain config while the storage key stays put.
 *
 * Every figure in the portfolio, the feed and the leaderboard used to have the
 * word ETH written next to it in the markup. On a collateral market that label
 * was wrong twice over: wrong token, and the number beside it was raw, so a bet
 * of twenty five dollars was announced as 25000000 ETH.
 */
export function tokenSymbol(token: StakeToken, chain: ChainKey): string {
  if (token !== COLLATERAL_LEG) return token;
  return getChainConfig(chain).stable.symbol;
}

/** How a market stands, for one token. */
export interface TokenMarket {
  /** Raw, same units as a leg of this token. */
  yesPool: number;
  noPool: number;
  /**
   * The pools after weighting, which are what a payout is divided by.
   *
   * Zero on the archived legs, which never had weighting, and zero on a
   * collateral market synced before these were recorded. A caller that gets
   * zero must fall back to the raw pool rather than dividing by it.
   */
  weightedYesPool: number;
  weightedNoPool: number;
  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
}

/**
 * The pools and the settlement flags for one token on one market.
 *
 * Each token has its own pair of pools and, for the collateral, its own copy of
 * the settlement flags, because the collateral contract is a different contract
 * from the V2 one and settles on its own schedule. Reading a collateral
 * position against `yesTotalAmount`, which is the ETH pool, produces a payout
 * ratio built from two unrelated markets and reports it as the user's.
 */
export function tokenMarket(prediction: RedisPrediction, token: StakeToken): TokenMarket {
  if (token === 'USDC') {
    return {
      yesPool: prediction.usdcYesTotalAmount ?? 0,
      noPool: prediction.usdcNoTotalAmount ?? 0,
      weightedYesPool: (prediction as { usdcWeightedYes?: number }).usdcWeightedYes ?? 0,
      weightedNoPool: (prediction as { usdcWeightedNo?: number }).usdcWeightedNo ?? 0,
      // A market can be settled on the collateral contract and not on the V2
      // one, or the reverse, so the collateral's own flags win when present.
      resolved: prediction.usdcResolved ?? prediction.resolved,
      cancelled: prediction.usdcCancelled ?? prediction.cancelled,
      outcome: prediction.usdcOutcome ?? prediction.outcome ?? false,
    };
  }
  if (token === 'SWIPE') {
    return {
      yesPool: prediction.swipeYesTotalAmount ?? 0,
      noPool: prediction.swipeNoTotalAmount ?? 0,
      weightedYesPool: 0,
      weightedNoPool: 0,
      resolved: prediction.resolved,
      cancelled: prediction.cancelled,
      outcome: prediction.outcome ?? false,
    };
  }
  return {
    yesPool: prediction.yesTotalAmount ?? 0,
    noPool: prediction.noTotalAmount ?? 0,
    weightedYesPool: 0,
    weightedNoPool: 0,
    resolved: prediction.resolved,
    cancelled: prediction.cancelled,
    outcome: prediction.outcome ?? false,
  };
}

/** Which way a leg is pointing, and how much is on each side of that call. */
export function legSides(l: StakeLeg) {
  const choice: 'YES' | 'NO' = l.yesAmount > l.noAmount ? 'YES' : 'NO';
  return {
    choice,
    staked: l.yesAmount + l.noAmount,
    backing: choice === 'YES' ? l.yesAmount : l.noAmount,
  };
}

/**
 * Running totals kept apart by token, which is the only honest way to keep them.
 *
 * See DECIMALS: a single cross-token sum is meaningless, so callers that want
 * one number have to pick a token and say which.
 */
export type TokenTotals = Record<
  StakeToken,
  { invested: number; payout: number; profit: number; bets: number }
>;

export function emptyTotals(): TokenTotals {
  return {
    ETH: { invested: 0, payout: 0, profit: 0, bets: 0 },
    SWIPE: { invested: 0, payout: 0, profit: 0, bets: 0 },
    USDC: { invested: 0, payout: 0, profit: 0, bets: 0 },
  };
}

/** Totals converted to readable units, for handing to a UI. */
export function displayTotals(totals: TokenTotals): TokenTotals {
  const out = emptyTotals();
  for (const token of LEGS) {
    out[token] = {
      invested: toDisplayUnits(totals[token].invested, token),
      payout: toDisplayUnits(totals[token].payout, token),
      profit: toDisplayUnits(totals[token].profit, token),
      bets: totals[token].bets,
    };
  }
  return out;
}
