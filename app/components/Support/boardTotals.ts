import { COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';

/**
 * Aggregates for the boards that show one chain's collateral.
 *
 * Extracted from the components so the one rule that matters can be tested:
 * nothing here ever adds two tokens together. Amounts are stored raw, so a whole
 * ETH is 1e18 and a whole dollar of collateral is 1e6. Even after both have been
 * converted to readable units the sum is a number in no currency, and the row
 * printing it has to choose one symbol, so it is guaranteed to be labelled with
 * a token it is not entirely in.
 *
 * On a total that reads badly. On a ranking it is worse: a speck of ETH sorts
 * above every real stablecoin bet, and the board is then ordered by which token
 * happens to have more decimals.
 */

/** Enough of a leaderboard row to total it. */
export interface StakedRow {
  /** Readable units of `totalsToken`. */
  totalStaked: number;
  /** Absent is read as the collateral leg, which is what the route sends. */
  totalsToken?: StakeToken;
}

/**
 * What the board has staked in the collateral, and nothing else.
 *
 * Rows denominated in anything else are skipped rather than converted. There is
 * no exchange rate in this app and inventing one to make a single total would be
 * a worse lie than showing two.
 */
export function collateralStaked(rows: readonly StakedRow[]): number {
  return rows
    .filter((row) => (row.totalsToken ?? COLLATERAL_LEG) === COLLATERAL_LEG)
    .reduce((sum, row) => sum + row.totalStaked, 0);
}

/** Enough of an activity row to total its payout. */
export interface PayoutRow {
  details?: {
    /** Readable units of `token`. The route already divided. */
    payout?: number;
    token?: StakeToken;
  };
}

/**
 * Collateral payouts in a set of activity rows, counted as well as summed.
 *
 * The count is returned because zero and "nothing claimed yet" are different
 * statements, and a feed that prints 0.0000 for the second one is claiming a
 * measurement it did not make.
 */
export function collateralPayouts(rows: readonly PayoutRow[]): {
  count: number;
  total: number;
} {
  const mine = rows.filter(
    (row) => !!row.details?.payout && (row.details.token ?? COLLATERAL_LEG) === COLLATERAL_LEG
  );
  return {
    count: mine.length,
    total: mine.reduce((sum, row) => sum + (row.details?.payout ?? 0), 0),
  };
}

/** How many rows sit on the archived contracts, and how many on the live one. */
export function eraSplit(rows: readonly { details?: { token?: StakeToken } }[]): {
  archived: number;
  collateral: number;
} {
  let archived = 0;
  let collateral = 0;
  for (const row of rows) {
    const token = row.details?.token;
    if (token === 'ETH' || token === 'SWIPE') archived++;
    else if (token === COLLATERAL_LEG) collateral++;
  }
  return { archived, collateral };
}
