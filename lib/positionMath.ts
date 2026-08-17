/**
 * What a position is currently worth if its side wins.
 *
 * Pure, and in its own module, because it is the number a user reads as their
 * money and because two copies of payout arithmetic drift. The contract's own
 * settlement is the authority; this mirrors its shape on the pools as they
 * stand, which is the best that can be said before a market resolves.
 *
 * The contract pays a winner their stake back plus a share of what the losing
 * side put in, less the platform and creator fees, and that share is weighted:
 * a bet placed early counts for more when the losing pool is divided. So the
 * ratio is over the WEIGHTED pool of your side, never the raw one. Using the
 * raw pool overstates a late bet and understates an early one, which is exactly
 * the thing the weighting exists to reward.
 *
 * Fees come out of the losing side only, so a winning stake is never shaved.
 */

export interface PositionEstimate {
  /** Your share of the losing pool, after fees. */
  winnings: number;
  /** Stake plus winnings, which is what actually lands in the wallet. */
  total: number;
  /** The multiplier this stake earned, 1 when it has none. */
  multiplier: number;
}

export function estimatePosition(params: {
  /** Your stake on the side you backed, in display units. */
  mine: number;
  /** Your weighted stake on that side. */
  myWeighted: number;
  /** The weighted total of the side you backed. */
  myWeightedPool: number;
  /** The raw total of the other side, which is what gets divided. */
  losingPool: number;
  platformFeeBps: number;
  creatorFeeBps: number;
}): PositionEstimate {
  const { mine, myWeighted, myWeightedPool, losingPool, platformFeeBps, creatorFeeBps } = params;

  const multiplier = mine > 0 ? myWeighted / mine : 1;

  // No weighted pool means nothing to take a share of, which is the honest
  // answer for a market where the only reads available are still zero.
  const share = myWeightedPool > 0 ? myWeighted / myWeightedPool : 0;

  const feeRate = (platformFeeBps + creatorFeeBps) / 10_000;
  const winnings = Math.max(0, losingPool) * (1 - feeRate) * share;

  return { winnings, total: mine + winnings, multiplier };
}
