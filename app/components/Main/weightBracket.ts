/**
 * Which time-weight bracket a bet placed now falls into.
 *
 * A copy of weightBpsAt from contracts/PredictionMarket_V4.sol, kept in its own
 * module so it can be tested without dragging a component and a stylesheet into
 * the test run. Two copies of payout arithmetic drift, and this one decides what
 * a user is told their stake is worth, so marketPools.test.ts asserts the
 * contract still contains the two comparisons below.
 *
 * The brackets are first quarter, second quarter, and then the whole second
 * half. That last one is a half, not a quarter: the third and fourth quarters
 * pay the same, and calling it "the last quarter" would tell someone betting at
 * sixty percent of the way through that they still have a premium coming.
 */

/** Early, mid and late, matching WEIGHT_EARLY, WEIGHT_MID and WEIGHT_LATE. */
export type WeightBracket = 0 | 1 | 2;

/** -1 when the market does not record enough to say. */
export function weightBracket(
  now: number,
  createdAt?: number,
  deadline?: number
): WeightBracket | -1 {
  if (!createdAt || !deadline || deadline <= createdAt) return -1;
  if (now <= createdAt) return 0;
  if (now >= deadline) return 2;

  const window = deadline - createdAt;
  const elapsed = now - createdAt;

  // Multiply, never divide, exactly as the contract does, so no integer
  // division decides a boundary and the strip cannot disagree with the payout.
  if (elapsed * 4 < window) return 0;
  if (elapsed * 2 < window) return 1;
  return 2;
}
