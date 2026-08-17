/**
 * Reading the archived leaderboard cache, which is not as simple as it looks.
 *
 * `/api/leaderboard/real-data` serves one Redis key. Two admin jobs write it and
 * they do not agree with each other, so a component reading it has to know which
 * one it is looking at.
 *
 *  - /api/admin/rescan-v2-leaderboard reads each position off the V2 contract.
 *    Per user amounts go in raw, and the summary is divided by 1e18 first.
 *  - /api/debug/leaderboard-data reads no positions at all. It takes a market's
 *    pool, divides it by the number of participants, and credits everybody with
 *    the quotient. Per user amounts go in raw, and the summary goes in raw too.
 *
 * So the per user figures are always raw wei, and the summary is in one of two
 * units with nothing in the payload saying which. That is also the only thing
 * that tells the two jobs apart.
 */

/** Both archived legs are 18 decimal tokens. */
export const ARCHIVED_DECIMALS = 18;

/**
 * A per user amount out of the cache, in units a person reads.
 *
 * Unconditional. The component divided only when the number cleared 1e15, on the
 * grounds that anything larger had to be wei. A real position of 0.0005 ETH is
 * 5e14 wei, clears nothing, and came out as 500000000000000.0000 ETH. Small V2
 * positions are the common case, so the guess failed on the ordinary input
 * rather than the exotic one.
 */
export function archivedUnits(raw: number): number {
  return raw / 10 ** ARCHIVED_DECIMALS;
}

export interface ArchivedSummary {
  totalETHStaked?: number;
  totalSWIPEStaked?: number;
}

/**
 * Whether the per person figures in this snapshot were measured or apportioned.
 *
 * True means the simplified collector wrote it, so a row's amount is the
 * market's pool divided by its participant count and not that person's bet. A
 * board built on that is not a ranking of who staked most and the screen has to
 * say so.
 *
 * The test is the summary's scale. The rescan stores it already divided, so ETH
 * lands in single or double digits and even a billion SWIPE lands at 1e9. The
 * simplified collector stores raw wei, which is 1e18 times larger. A threshold
 * of 1e15 sits in the gap with a wide margin either side.
 *
 * An empty or absent summary reads as false, which is the safe direction: with
 * nothing staked there is nothing to mislabel.
 */
export function isApportioned(summary: ArchivedSummary | undefined): boolean {
  const eth = summary?.totalETHStaked ?? 0;
  const swipe = summary?.totalSWIPEStaked ?? 0;
  return eth >= 1e15 || swipe >= 1e15;
}

export type ArchivedPool = 'eth' | 'swipe';

export interface ArchivedRow {
  /** Raw wei. */
  totalStakedETH: number;
  /** Raw wei. */
  totalStakedSWIPE: number;
}

/** One pool's raw amount on one row. Two pools are never added together. */
export function rowStake(row: ArchivedRow, pool: ArchivedPool): number {
  return pool === 'eth' ? row.totalStakedETH : row.totalStakedSWIPE;
}

/**
 * The total for one pool across the rows on screen, in readable units.
 *
 * Summed from the rows rather than taken from the cached `summary`, because the
 * summary's units depend on which job wrote it and this figure's label does not
 * get to be a coin flip. It is also a narrower claim: these rows, not the
 * platform, which is what the label beside it says.
 */
export function shownPoolTotal(rows: readonly ArchivedRow[], pool: ArchivedPool): number {
  return archivedUnits(rows.reduce((sum, row) => sum + rowStake(row, pool), 0));
}

/** Rows ordered inside one pool, on that pool's own token, and renumbered. */
export function rankByPool<T extends ArchivedRow>(
  rows: readonly T[],
  pool: ArchivedPool
): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => rowStake(b, pool) - rowStake(a, pool))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
