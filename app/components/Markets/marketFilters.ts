/**
 * What the markets grid is allowed to show, and under which filters.
 *
 * Pulled out of MarketGrid.tsx so it can be tested. Vitest here is configured
 * for `lib/**\/*.test.ts` and `app/**\/*.test.ts`, and tsconfig sets `jsx:
 * preserve`, so a .tsx cannot be imported from a test. Every decision about
 * whether a market appears therefore lives in this file, and the component only
 * renders what comes back.
 *
 * The shape below is structural on purpose. HybridPrediction satisfies it, and
 * so does a three-field object literal in a test, which is the difference
 * between a test that can be written and one that cannot.
 */

/**
 * Four states, not three.
 *
 * "proposed" was added after the grid was first taught to hide proposals
 * outright. Hiding them is correct for the open view, because a card that
 * invites a bet on a market with no contract behind it is a lie. But a
 * proposal nobody can see is a proposal nobody can want, and the queue an
 * admin registers from had no signal in it beyond arrival order.
 *
 * So proposals get their own bucket, their own label on the card, and a like
 * button. They are still absent from open, from resolved and from all, because
 * those three are about markets that exist.
 */
export type StatusFilter = "open" | "proposed" | "resolved" | "all";

/** `null` is every category. Any other value is an exact category name. */
export type CategoryFilter = string | null;

export interface FilterableMarket {
  category?: string;
  deadline: number;
  resolved: boolean;
  cancelled: boolean;
  /**
   * True while a proposal is waiting for an admin. Optional here only because
   * an older stored record may not carry the field; absent is treated as
   * approved, which is what every record written before approval existed was.
   */
  needsApproval?: boolean;
  usdcParticipants?: string[];
  usdcParticipantCount?: number;
  participants?: string[];
}

/**
 * How many distinct people are in this market.
 *
 * Three fields answer this and none of them answers it alone. `participants` is
 * the V2 array, written by the ETH and SWIPE sync. `usdcParticipants` and
 * `usdcParticipantCount` are written by /api/sync/usdc, and the count is
 * written on every pass while the array is only written when the count is above
 * zero. The old reading here was a `??` chain, which stops at the first field
 * that is merely present: a market the collateral sync has touched carries
 * `usdcParticipantCount: 0`, and 0 is not nullish, so the V2 array below it was
 * never consulted. On live Base data pred_v2_226 reads 4 that way and has 9
 * addresses in the V2 array, and pred_v2_225 reads 1 against 6.
 *
 * A union, not a sum. Those two records share addresses across the two arrays,
 * so adding them invents bettors. The count is kept as a floor for the case
 * where the array was never written.
 */
export function playerCount(m: FilterableMarket): number {
  const seen = new Set<string>();
  for (const a of m.usdcParticipants ?? []) seen.add(a.toLowerCase());
  for (const a of m.participants ?? []) seen.add(a.toLowerCase());
  return Math.max(seen.size, m.usdcParticipantCount ?? 0);
}

/**
 * Is this a market, or is it somebody's proposal?
 *
 * A proposal sits in Redis with `needsApproval: true` until an admin registers
 * it on chain. It has a question, a deadline and a category, so every test the
 * grid used to run said "open market" and drew a card that invites a bet on
 * something that does not exist on chain. TinderCard has gated on this in four
 * places for a while; the grid gated on nothing.
 */
export function isRegistered(m: FilterableMarket): boolean {
  return m.needsApproval !== true;
}

export function isOpen(m: FilterableMarket, now: number): boolean {
  return isRegistered(m) && !m.resolved && !m.cancelled && m.deadline > now;
}

export function isSettled(m: FilterableMarket): boolean {
  return isRegistered(m) && (m.resolved || m.cancelled);
}

/**
 * Waiting for an admin, and still worth showing.
 *
 * A proposal past its own deadline is not waiting for anything: registering it
 * would create a market that closed before it opened. Those drop out rather
 * than sitting in the queue collecting likes nobody can act on.
 */
export function isProposed(m: FilterableMarket, now: number): boolean {
  return !isRegistered(m) && !m.resolved && !m.cancelled && m.deadline > now;
}

/**
 * A settled market nobody bet on has nothing to read: no pool, no players, no
 * result worth looking at. Those filled the grid with empty tiles, so they are
 * dropped from the settled and combined views. An open market is never dropped
 * for having no players, because having none is what an open market with room
 * in it looks like.
 */
export function worthShowing(m: FilterableMarket): boolean {
  if (!isRegistered(m)) return false;
  if (!(m.resolved || m.cancelled)) return true;
  return playerCount(m) > 0;
}

/** Trimmed, or empty when a record carries no category at all. */
export function categoryOf(m: FilterableMarket): string {
  return (m.category ?? "").trim();
}

export function matchesCategory(m: FilterableMarket, category: CategoryFilter): boolean {
  return category === null || categoryOf(m) === category;
}

export function matchesStatus(
  m: FilterableMarket,
  status: StatusFilter,
  now: number
): boolean {
  if (status === "open") return isOpen(m, now);
  if (status === "proposed") return isProposed(m, now);
  if (status === "resolved") return isSettled(m) && worthShowing(m);
  return worthShowing(m);
}

/**
 * The two filters compose, and both run after the approval gate.
 *
 * Sorting differs by status because the question differs: an open market is
 * read for what closes next, a settled one for what settled last.
 */
export function selectMarkets<T extends FilterableMarket>(
  markets: readonly T[],
  opts: { status: StatusFilter; category: CategoryFilter; now: number }
): T[] {
  const { status, category, now } = opts;
  const list = markets.filter(
    (m) => matchesStatus(m, status, now) && matchesCategory(m, category)
  );
  // Open sorts by what closes next. Settled sorts by what settled last. A
  // proposal is read for what is still worth registering, so the one with the
  // most time left to run comes first.
  return list.sort((a, b) =>
    status === "open" ? a.deadline - b.deadline : b.deadline - a.deadline
  );
}

export function countMatching(
  markets: readonly FilterableMarket[],
  status: StatusFilter,
  category: CategoryFilter,
  now: number
): number {
  let n = 0;
  for (const m of markets) {
    if (matchesStatus(m, status, now) && matchesCategory(m, category)) n++;
  }
  return n;
}

export interface CategoryOption {
  name: string;
  count: number;
}

/**
 * The categories worth offering, derived from what is loaded.
 *
 * The canonical list lives in CreatePredictionModal and has ten entries. Live
 * Base data uses three of them: Crypto, Sports, Other. Offering the other seven
 * would be seven buttons that each lead to an empty page, which is the one
 * thing a filter must not do, so the options come from the markets in hand
 * rather than from the list.
 *
 * They are derived against the status filter that is on, so a category is only
 * ever offered when that combination has something in it. `keep` is the
 * selection the user already made: it stays in the list at zero rather than
 * vanishing under them, so the button they pressed is still there to press
 * again, and the empty state can name it.
 *
 * Busiest first, alphabetically inside a tie, so the order is stable between
 * renders and the two categories anybody asked for come first.
 */
export function categoryOptions(
  markets: readonly FilterableMarket[],
  status: StatusFilter,
  now: number,
  keep: CategoryFilter = null
): CategoryOption[] {
  const counts = new Map<string, number>();
  if (keep !== null) counts.set(keep, 0);

  for (const m of markets) {
    if (!matchesStatus(m, status, now)) continue;
    const name = categoryOf(m);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
