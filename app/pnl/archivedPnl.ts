import { estimatePosition } from '@/lib/positionMath';

/**
 * Everything the two P&L screens do to a response, with no React in it.
 *
 * The screens are /pnl and /pnl/[address], and until now they were two copies
 * of the same code that had drifted: one had been fixed, the other still read
 * `stakesData.stakes` (the route answers one level down, under `data`), still
 * matched on `s.user` (the entry is keyed `userId`), and still read
 * `ethStake` and `swipeStake` off it (no route has ever returned either). The
 * three bugs were invisible because every one of them lands on an `undefined`
 * that a guard treats as "no positions", so the page rendered an honest looking
 * empty state instead of an error.
 *
 * Two copies is the actual defect, so the shared part lives here and the pages
 * hold layout and nothing else. The parsing is exported one piece at a time
 * because that is what can be tested against the route's real shape.
 */

/**
 * PredictionMarket_V2's platform cut, in basis points.
 *
 * These screens read V1 and V2 markets and nothing else, so the live 300 plus
 * 50 would be the wrong rates. The archived contract takes 100 bps from the
 * losing pool, pays no creator cut and has no time weighting, which is why the
 * weighted arguments below are just the raw stake.
 */
export const ARCHIVED_PLATFORM_FEE_BPS = 100;

/**
 * What app/api/predictions/[id]/stakes/route.ts says when the market it was
 * asked about is not on V1 or V2.
 *
 * The route reads the archived Base contracts, so a live V4 market has no
 * answer there at all. Rather than guess, it returns an empty list and names
 * itself. An empty list on its own would be indistinguishable from "nobody bet
 * on this", and the two want different words on screen.
 */
export const ARCHIVED_ONLY = 'archived-contracts-only';

/** How many stakes requests are allowed to be in flight at once. */
export const STAKES_CONCURRENCY = 6;

/** The fields these screens read off /api/predictions. */
export interface ApiPrediction {
  id: string;
  question: string;
  deadline: number;
  contractVersion?: string;
  resolved?: boolean;
  outcome?: boolean;
  cancelled?: boolean;
  /** Everyone the archived V2 contract recorded a bet from. */
  participants?: string[];
  /** Everyone /api/sync/usdc recorded a bet from, which is the live product. */
  usdcParticipants?: string[];
  yesTotalAmount?: number;
  noTotalAmount?: number;
  swipeYesTotalAmount?: number;
  swipeNoTotalAmount?: number;
}

/**
 * One entry from /api/predictions/[id]/stakes.
 *
 * Read off the route, not guessed. It keys the address as `userId`, puts both
 * token legs flat on the same object in wei, and reports no payout of any kind.
 */
export interface RouteStake {
  userId: string;
  yesAmount: number;
  noAmount: number;
  swipeYesAmount: number;
  swipeNoAmount: number;
  claimed: boolean;
}

export interface PnlLeg {
  yesAmount: number;
  noAmount: number;
  potentialPayout: number;
  potentialProfit: number;
  isWinner: boolean;
}

/**
 * One table row. Structurally the `PredictionWithStakes` that PNLTable takes,
 * spelled out here so this module does not import a component. The pages
 * annotate the array with the component's own type, so a change on either side
 * is a typecheck failure rather than a runtime surprise.
 */
export interface PnlRow {
  id: string;
  question: string;
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
  userStakes: {
    ETH?: PnlLeg;
    SWIPE?: PnlLeg;
  };
}

/**
 * Can the stakes route answer about this market at all.
 *
 * Deliberately the same test the route runs on the record it loads, so the two
 * agree without a round trip. A market that fails it is skipped rather than
 * fetched, which is the difference between one request per market the user is
 * in and one request per market that can produce a row.
 */
export function isArchivedMarket(prediction: {
  id?: string;
  contractVersion?: string;
}): boolean {
  const id = prediction.id ?? '';
  return (
    prediction.contractVersion === 'V1' ||
    prediction.contractVersion === 'V2' ||
    id.startsWith('pred_v1_') ||
    id.startsWith('pred_v2_')
  );
}

export interface MarketSelection {
  /** Markets worth a request: this wallet is in them and they are archived. */
  queryable: ApiPrediction[];
  /** Markets this wallet is in that live on the current contract. */
  liveElsewhere: number;
}

/**
 * Which markets to ask about.
 *
 * The listing is the whole chain, 247 records on Base as this is written,
 * carrying 2415 participant entries between them, and the stakes route reads
 * the contract for every entry of every market it is asked about. Asking about
 * all 247 was thousands of RPC calls for a page that needs a handful. Two
 * filters, both free: the participant lists are already in the listing, and the
 * contract version is on the record.
 *
 * Both lists, not one. A record carries `participants`, written by the archived
 * V2 contract, and `usdcParticipants`, written by /api/sync/usdc and holding
 * everyone who has bet since. Reading only the first is why the live markets
 * looked deserted: pred_v4_1 on Base has an empty `participants` array and two
 * wallets in `usdcParticipants`, so a screen that reads one of them counts zero
 * live positions for people who are holding one.
 */
export function selectMarkets(
  predictions: readonly ApiPrediction[],
  userAddress: string
): MarketSelection {
  const wallet = userAddress.toLowerCase();
  const mine = predictions.filter((p) =>
    [...(p.participants ?? []), ...(p.usdcParticipants ?? [])].some(
      (a) => (a ?? '').toLowerCase() === wallet
    )
  );
  const queryable = mine.filter(isArchivedMarket);
  return { queryable, liveElsewhere: mine.length - queryable.length };
}

/**
 * The stakes request, with the chain on it.
 *
 * Both deployments number their markets from 1, so `pred_v2_5` is not enough to
 * name a market. Without `?chain=` the route falls back to Base, which is right
 * on Base and quietly wrong everywhere else. No `?userAddress=`: the route
 * never read one, it answers with every participant and the filtering happens
 * here.
 */
export function stakesUrl(predictionId: string, chain: string): string {
  return `/api/predictions/${encodeURIComponent(predictionId)}/stakes?chain=${encodeURIComponent(chain)}`;
}

export interface StakesAnswer {
  stakes: RouteStake[];
  /** The route named itself: it cannot price this market, nothing is missing. */
  archivedOnly: boolean;
}

/** Pull the stake list out of a stakes response, at the depth it really sits. */
export function readStakes(payload: unknown): StakesAnswer {
  const body = (payload ?? {}) as {
    success?: boolean;
    source?: string;
    data?: { stakes?: unknown };
  };
  const raw = body.data?.stakes;
  return {
    stakes: body.success === true && Array.isArray(raw) ? (raw as RouteStake[]) : [],
    archivedOnly: body.source === ARCHIVED_ONLY,
  };
}

/** This wallet's entry, matched on the key the route actually uses. */
export function findUserStake(
  stakes: readonly RouteStake[],
  userAddress: string
): RouteStake | undefined {
  const wallet = userAddress.toLowerCase();
  return stakes.find((s) => (s?.userId ?? '').toLowerCase() === wallet);
}

/**
 * What one token leg is worth, from the pools the market carries.
 *
 * The pages used to read `potentialPayout` and `isWinner` off the stake object
 * and fall to `|| 0` and `|| false` every time. They are worked out here
 * instead, through estimatePosition, which is the function the portfolio, the
 * swipe card and the OG card settle with, so these screens cannot quote a
 * different payout from the rest of the app for the same position.
 */
export function legFor(
  prediction: ApiPrediction,
  token: 'ETH' | 'SWIPE',
  yesAmount: number,
  noAmount: number,
  nowSeconds: number = Date.now() / 1000
): PnlLeg | undefined {
  const staked = yesAmount + noAmount;
  if (staked <= 0) return undefined;

  // Same tie-break as legSides in lib/userStake, so one position is never on
  // YES here and on NO in the portfolio.
  const backedYes = yesAmount > noAmount;
  const backing = backedYes ? yesAmount : noAmount;

  const yesPool =
    (token === 'ETH' ? prediction.yesTotalAmount : prediction.swipeYesTotalAmount) ?? 0;
  const noPool =
    (token === 'ETH' ? prediction.noTotalAmount : prediction.swipeNoTotalAmount) ?? 0;

  const myPool = backedYes ? yesPool : noPool;
  const losingPool = backedYes ? noPool : yesPool;

  const ifMySideWins = () =>
    estimatePosition({
      mine: backing,
      myWeighted: backing,
      myWeightedPool: myPool,
      losingPool,
      platformFeeBps: ARCHIVED_PLATFORM_FEE_BPS,
      creatorFeeBps: 0,
    }).total;

  let potentialPayout = 0;
  let potentialProfit = 0;
  let isWinner = false;

  if (prediction.cancelled) {
    // A cancelled market hands everyone their own stake back, both sides of it.
    potentialPayout = staked;
  } else if (prediction.resolved) {
    isWinner = prediction.outcome === backedYes;
    if (isWinner) {
      potentialPayout = ifMySideWins();
      potentialProfit = potentialPayout - staked;
    } else {
      potentialProfit = -staked;
    }
  } else if (prediction.deadline > nowSeconds) {
    // Still running, so this is what the pools would pay if this side wins,
    // not a result. Nothing is owed yet.
    potentialPayout = ifMySideWins();
    potentialProfit = potentialPayout - staked;
  }
  // Past its deadline and unresolved is left at zero on purpose. These markets
  // cannot be resolved any more, the owner key is gone, but calling that a
  // realised loss would be these pages inventing a settlement.

  return { yesAmount, noAmount, potentialPayout, potentialProfit, isWinner };
}

export function statusOf(
  prediction: ApiPrediction,
  nowSeconds: number = Date.now() / 1000
): PnlRow['status'] {
  if (prediction.resolved) return 'resolved';
  if (prediction.cancelled) return 'cancelled';
  if (prediction.deadline && prediction.deadline <= nowSeconds) return 'expired';
  return 'active';
}

/**
 * One row, or nothing if this wallet holds no leg of this market.
 *
 * A leg the wallet is not in comes back undefined and is spread away, so a
 * SWIPE only position does not gain an empty ETH row that PNLTable would count
 * as a bet.
 */
export function rowFor(
  prediction: ApiPrediction,
  stake: RouteStake,
  nowSeconds: number = Date.now() / 1000
): PnlRow | null {
  const eth = legFor(
    prediction,
    'ETH',
    Number(stake.yesAmount) || 0,
    Number(stake.noAmount) || 0,
    nowSeconds
  );
  const swipe = legFor(
    prediction,
    'SWIPE',
    Number(stake.swipeYesAmount) || 0,
    Number(stake.swipeNoAmount) || 0,
    nowSeconds
  );
  if (!eth && !swipe) return null;

  return {
    id: prediction.id,
    question: prediction.question,
    resolved: prediction.resolved || false,
    outcome: prediction.outcome,
    cancelled: prediction.cancelled || false,
    status: statusOf(prediction, nowSeconds),
    userStakes: {
      ...(eth && { ETH: eth }),
      ...(swipe && { SWIPE: swipe }),
    },
  };
}

/**
 * Map with a ceiling on how many are in flight.
 *
 * The loop this replaces was `for (...) await fetch(...)`, one round trip at a
 * time. The busiest wallet on Base is in 105 archived markets, so that was 105
 * serial requests, each of which reads the contract once per participant of the
 * market it names, and one of those markets has 95 participants. Measured
 * against the dev server, three markets of 3, 10 and 55 participants took 1.5,
 * 3.2 and 16.6 seconds. Order is preserved because the result index is the
 * input index, not the order things happen to finish.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));
  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return out;
}

export interface PnlSummary {
  rows: PnlRow[];
  /** Markets on the current contract, which these screens cannot price. */
  notCovered: number;
  /** Markets whose request failed, so their positions are missing, not absent. */
  unreadable: number;
}

/** `1 market`, `2 markets`. Used in copy, so it has to get one right. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The sentence under an empty table, or null when the table has rows.
 *
 * "No predictions found for this user" was the old text, and for a wallet whose
 * every bet is on the live contract it was simply false. The wallet has
 * positions. This screen cannot read them.
 *
 * The last line states the scope without a count, and it is the one that runs
 * when the listing shows this wallet in nothing at all. A count is better when
 * there is one, so selectMarkets reads both participant lists to get it, but
 * a record can carry neither: pred_v4_2 on Base has an empty `participants` and
 * no `usdcParticipants` key. Saying "you have nothing" to a wallet holding a
 * position on a contract this screen does not read would be the old lie again,
 * so the scope goes on screen instead and the dashboard answers the rest.
 */
export function emptyStateMessage(summary: PnlSummary): string | null {
  if (summary.rows.length > 0) return null;
  if (summary.unreadable > 0) {
    return `Nothing to show, and ${plural(
      summary.unreadable,
      'market',
      'markets'
    )} could not be read just now. That is a failed request rather than an empty wallet. Try again in a moment.`;
  }
  if (summary.notCovered > 0) {
    return `No archived ETH or SWIPE positions here. This wallet holds ${plural(
      summary.notCovered,
      'live position',
      'live positions'
    )} on the current contract, which this screen cannot price. The dashboard has them.`;
  }
  return 'No archived ETH or SWIPE positions for this wallet. Only contracts V1 and V2 are read here, so a bet placed in USDC or USDG will not show up. The dashboard has those.';
}

/** The line above a table that is telling less than the whole truth. */
export function coverageNotice(summary: PnlSummary): string | null {
  if (summary.rows.length === 0) return null;
  const parts: string[] = [];
  if (summary.notCovered === 1) {
    parts.push(
      '1 position on the current contract is not in this total, it is in the dashboard.'
    );
  } else if (summary.notCovered > 1) {
    parts.push(
      `${summary.notCovered} positions on the current contract are not in this total, they are in the dashboard.`
    );
  }
  if (summary.unreadable > 0) {
    parts.push(
      `${plural(summary.unreadable, 'market', 'markets')} could not be read, so the total is short.`
    );
  }
  return parts.length ? parts.join(' ') : null;
}
