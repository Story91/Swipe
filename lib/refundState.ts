/**
 * Where one position sits on the contract's refund path.
 *
 * PredictionMarket_V4 has a guarantee nobody could reach from the app. If a
 * market goes REFUND_GRACE_PERIOD past its deadline without being resolved or
 * cancelled, `enableRefundsAfterGrace` flips it to refundable, and it is
 * callable by anyone on purpose so that backers do not need a privileged party
 * to still be around. Then every backer takes their raw unweighted stake back
 * with `claimRefund`. Neither call had a caller anywhere in the app, so a market
 * whose resolver walked away held its backers' money with no way out.
 *
 * The arithmetic lives here rather than in the component because it decides
 * whether a button that spends gas appears. Both comparisons are copied from
 * the contract, including which one is strict:
 *
 *   enableRefundsAfterGrace: !resolved && !cancelled && !refundable
 *                            && block.timestamp > deadline + REFUND_GRACE_PERIOD
 *   claimRefund:             refundable && !claimed && yesAmount + noAmount > 0
 *
 * bigint throughout. Unix seconds fit a double today, but `deadline` arrives
 * from a contract read as a uint256 and Number() on a large one silently
 * returns Infinity, which would make every comparison here answer the wrong way
 * round.
 */

/** 30 days, matching PredictionMarket_V4.REFUND_GRACE_PERIOD. */
export const REFUND_GRACE_SECONDS = BigInt(30 * 24 * 60 * 60);

export type RefundStage =
  /** The contract has never heard of this market. Nothing to refund. */
  | 'unknown'
  /** Still before the deadline. Nothing to do. */
  | 'open'
  /** Past the deadline, grace still running. The money is stuck but not lost. */
  | 'waiting'
  /** Grace is over and nobody settled. Anyone may open refunds. */
  | 'openable'
  /** Refundable, and this address is owed its stake. */
  | 'claimable'
  /** Refundable, and this address already took it. */
  | 'taken'
  /** Refundable, and this address holds nothing to take. */
  | 'empty'
  /** Resolved with winners. Winnings are claimed elsewhere, not refunded. */
  | 'settled';

export interface RefundView {
  stage: RefundStage;
  /**
   * The first second at which enableRefundsAfterGrace stops reverting. Always
   * computed, so a 'waiting' row can count down to it.
   */
  opensAt: bigint;
  /** Raw collateral units this address gets back. Unweighted, as the contract pays. */
  amount: bigint;
}

export function refundState(params: {
  /** getPrediction's first output. See the comment below; this is load bearing. */
  registered: boolean;
  resolved: boolean;
  cancelled: boolean;
  refundable: boolean;
  /** From getPrediction, unix seconds. */
  deadline: bigint;
  now: bigint;
  /** From positions(id, user). */
  yesAmount: bigint;
  noAmount: bigint;
  claimed: boolean;
}): RefundView {
  const {
    registered,
    resolved,
    cancelled,
    refundable,
    deadline,
    now,
    yesAmount,
    noAmount,
    claimed,
  } = params;

  const amount = yesAmount + noAmount;
  const opensAt = deadline + REFUND_GRACE_SECONDS;

  // getPrediction carries no predictionExists modifier, unlike almost every
  // other function on the contract. Ask it about an id it has never seen and it
  // reads an empty struct out of the mapping and answers cheerfully: registered
  // false, deadline 0, nothing resolved, nothing cancelled. A deadline of 0
  // means `now > 0 + 30 days` is true for every clock since 1970, so without
  // this line an unknown market renders as ready for refunds, and the button
  // sends a transaction that reverts on the modifier enableRefundsAfterGrace
  // does have.
  if (!registered) return { stage: 'unknown', opensAt, amount };

  // The flag is checked first because it is the only thing claimRefund looks
  // at. A cancelled market sets it in the same transaction, and so does a
  // market that resolved with nobody on the winning side, so this one branch
  // covers all three ways a position becomes refundable.
  if (refundable) {
    if (amount === BigInt(0)) return { stage: 'empty', opensAt, amount };
    return { stage: claimed ? 'taken' : 'claimable', opensAt, amount };
  }

  // Resolved without the flag means there were winners, which is claimWinnings'
  // job. Cancelled without the flag cannot happen on chain; treated as settled
  // rather than offered a refund button that would revert.
  if (resolved || cancelled) return { stage: 'settled', opensAt, amount };

  // Strictly greater, as the contract has it. At exactly deadline + 30 days the
  // call still reverts with "Grace period not over", and a button offered one
  // second early costs a signature and the gas to learn that.
  if (now > opensAt) return { stage: 'openable', opensAt, amount };
  if (now >= deadline) return { stage: 'waiting', opensAt, amount };
  return { stage: 'open', opensAt, amount };
}

/**
 * How long until refunds can be opened, in plain words.
 *
 * Rounded down to whole days until the last day, then to hours. Nobody waiting
 * out a 30 day grace period needs it to the minute, and a figure that precise
 * invites the reader to trust a block timestamp more than it deserves.
 */
export function timeUntilRefundsOpen(opensAt: bigint, now: bigint): string {
  const seconds = opensAt - now;
  if (seconds <= BigInt(0)) return 'any moment now';

  const hours = seconds / BigInt(3600);
  if (hours < BigInt(1)) return 'in under an hour';
  if (hours < BigInt(24)) return `in ${hours} ${hours === BigInt(1) ? 'hour' : 'hours'}`;

  const days = hours / BigInt(24);
  return `in ${days} ${days === BigInt(1) ? 'day' : 'days'}`;
}
