import { isCurrentMarketId } from '@/lib/marketId';
import type { RedisPrediction } from '@/lib/types/redis';

/**
 * Counting the markets on a chain honestly.
 *
 * The strip above the grid used to print two figures that were not true.
 *
 * MARKETS 245 was `marketStats.totalPredictions`, which is every record in the
 * chain's Redis namespace: V1 and V2 markets on contracts whose owner key is
 * gone, proposals nobody has accepted, and the handful of markets the live
 * contract actually holds, added together and labelled as if they were one
 * thing. A number that mixes a frozen archive with a live book cannot be made
 * honest by relabelling it, so it is split here instead.
 *
 * VOLUME 0.391 ETH was `yesTotalAmount + noTotalAmount` summed over every
 * record. Those two fields are the archived ETH pools. Every bet placed since
 * the collateral contracts shipped lands in `usdcYesTotalAmount` and
 * `usdcNoTotalAmount` instead, so the figure was frozen at whatever the old
 * pools held and named a token the app no longer settles in. The collateral
 * pools are not in redisHelpers.updateCompactStats at all, which is why this
 * runs over the predictions rather than reading the cache.
 *
 * Pure and separate from the route so the rules can be tested without Redis.
 */

/** What a chain's book looks like, with the archive kept apart from the live. */
export interface MarketCensus {
  /** Live-generation markets accepting a bet right now. */
  open: number;
  /** Live-generation markets, whatever state, proposals excluded. */
  markets: number;
  /** Live-generation proposals that are not on chain yet. */
  awaiting: number;
  /** Markets minted by an older contract generation. Frozen, not countable. */
  archived: number;
  /** Distinct wallets holding a position on a live-generation market. */
  players: number;
  /**
   * Collateral pooled across live-generation markets, raw, six decimals.
   *
   * Raw on purpose. It is handed to toDisplayUnits at the edge, the same way
   * every other stored amount is, so the decimals live in one place. Never
   * added to an ETH or SWIPE figure: those are eighteen decimals and the sum
   * would be the wei leg with a rounding error attached.
   */
  pooledRaw: number;
  /** The same sum over the archived generations, for the record. */
  archivedPooledRaw: number;
}

/**
 * True while a market is still only a proposal.
 *
 * Mirrors app/components/Admin/adminMarkets.ts. `usdcPoolEnabled` is the
 * registration signal, set by /api/sync/usdc once the live contract answers
 * `registered: true`, and it has to win: nothing clears `needsApproval` after a
 * market goes on chain, so a registered market keeps claiming to be a proposal
 * forever and would never be counted as open.
 */
function isProposal(p: RedisPrediction): boolean {
  const registered = p.usdcPoolEnabled === true;
  return !registered && p.needsApproval === true && p.approved !== true;
}

/**
 * Settled or called off, reading the collateral contract's own flags first.
 *
 * A market can be resolved on the collateral contract and not on the archived
 * V2 one, or the reverse. `tokenMarket` in lib/userStake makes the same choice
 * for the same reason.
 */
function isFinished(p: RedisPrediction): boolean {
  return (p.usdcResolved ?? p.resolved) === true || (p.usdcCancelled ?? p.cancelled) === true;
}

function collateralOf(p: RedisPrediction): number {
  return (Number(p.usdcYesTotalAmount) || 0) + (Number(p.usdcNoTotalAmount) || 0);
}

/**
 * Everyone with a position on a market, both lists, lowercased.
 *
 * `participants` is written by the archived V2 contract and `usdcParticipants`
 * by the collateral sync. A wallet can be in both, so the union is taken and
 * cased the way REDIS_KEYS.USER_STAKES cases it.
 */
function bettorsOn(p: RedisPrediction): string[] {
  return [...(p.participants ?? []), ...(p.usdcParticipants ?? [])]
    .filter((a): a is string => typeof a === 'string' && a.length > 0)
    .map((a) => a.toLowerCase());
}

/**
 * Read a chain's predictions into the two piles that can each be stated plainly.
 *
 * `now` is unix seconds and is a parameter rather than a Date.now() call so a
 * test can sit a market either side of its deadline without waiting.
 */
export function marketCensus(
  predictions: readonly RedisPrediction[],
  now: number
): MarketCensus {
  const census: MarketCensus = {
    open: 0,
    markets: 0,
    awaiting: 0,
    archived: 0,
    players: 0,
    pooledRaw: 0,
    archivedPooledRaw: 0,
  };

  const players = new Set<string>();

  for (const p of predictions) {
    // Anything the current contract generation did not mint sits on a contract
    // that can never be resolved again. It is history, and it is counted as
    // history rather than folded into the live total.
    if (!isCurrentMarketId(p.id)) {
      census.archived += 1;
      census.archivedPooledRaw += collateralOf(p);
      continue;
    }

    if (isProposal(p)) {
      census.awaiting += 1;
      continue;
    }

    census.markets += 1;
    census.pooledRaw += collateralOf(p);
    for (const bettor of bettorsOn(p)) players.add(bettor);

    if (!isFinished(p) && (Number(p.deadline) || 0) > now) census.open += 1;
  }

  census.players = players.size;
  return census;
}
