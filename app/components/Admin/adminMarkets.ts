import { CURRENT_GENERATION, parseMarketId, type MarketGeneration } from '@/lib/marketId';
import type { RedisPrediction } from '@/lib/types/redis';

/**
 * What the admin screen is allowed to think about, and which pile each market
 * lands in.
 *
 * This is a separate module because the bucketing is the whole screen. A
 * proposal that lands in the wrong pile is invisible, and that is exactly what
 * happened: the dashboard narrowed its list to ids starting `pred_v1_` or
 * `pred_v2_` before doing anything else, so every market the current contract
 * mints was dropped on the floor, including the one proposal anybody has ever
 * made. The pending count was then computed off that same narrowed list and
 * never rendered at all.
 *
 * So the rules live here, in a pure function, with a test beside them.
 */

export type AdminBucket = 'proposal' | 'settle' | 'running' | 'archived';

export interface AdminMarket {
  /** Canonical Redis id, eg pred_v4_2. */
  id: string;
  /** The id the contract knows, or null when the Redis id cannot be read. */
  number: number | null;
  /** Which contract generation minted it, or null for an id we cannot parse. */
  generation: MarketGeneration | null;
  question: string;
  category: string;
  creator: string;
  /** Unix seconds. */
  deadline: number;
  /** Unix seconds. When the proposal was written. */
  createdAt: number;
  /** Collateral pool in raw contract units, six decimals on every live chain. */
  pool: number;
  participants: number;
  /** Proposed and not yet accepted, straight off the record. */
  pending: boolean;
  /** A sync has seen it registered on the live contract. */
  registered: boolean;
}

export interface AdminGroups {
  proposal: AdminMarket[];
  settle: AdminMarket[];
  running: AdminMarket[];
  archived: AdminMarket[];
}

/**
 * Read one Redis record into the shape this screen uses.
 *
 * `usdcPoolEnabled` is the registration signal, which reads oddly and is worth
 * spelling out. /api/sync/usdc sets it when the live contract answers
 * `registered: true` for the market, and it is the only durable trace of a
 * registration anywhere in Redis: nothing clears `needsApproval` after a market
 * goes on chain, so a record keeps claiming to be a proposal forever. Reading
 * the flag the sync does write is what makes a registered proposal leave the
 * queue and stay gone across a reload.
 */
export function toAdminMarket(p: RedisPrediction): AdminMarket {
  const ref = parseMarketId(p.id);
  return {
    id: p.id,
    number: ref?.numericId ?? null,
    generation: ref?.generation ?? null,
    question: p.question ?? '',
    category: p.category ?? '',
    creator: p.creator ?? '',
    deadline: Number(p.deadline) || 0,
    createdAt: Number(p.createdAt) || 0,
    pool: (Number(p.usdcYesTotalAmount) || 0) + (Number(p.usdcNoTotalAmount) || 0),
    participants: p.usdcParticipants?.length ?? p.participants?.length ?? 0,
    pending: p.needsApproval === true && p.approved !== true,
    registered: p.usdcPoolEnabled === true,
  };
}

/**
 * Which pile a market belongs in.
 *
 * Archived is not a state a market is in, it is a statement about the contract
 * holding it. Base's V1, V2 and USDC pool are owned by a key nobody has, so a
 * market minted by any of them can never be resolved or cancelled again and no
 * button on this screen should suggest otherwise.
 */
export function bucketOf(m: AdminMarket, now: number): AdminBucket {
  const current = m.generation === CURRENT_GENERATION;

  // Legacy ids predate the generation prefixes and were never on a contract, so
  // they still settle through the API. Everything else that is not current sits
  // on a dead contract.
  if (!current && m.generation !== 'legacy') return 'archived';

  const awaiting = m.pending && !m.registered;
  if (awaiting) return current ? 'proposal' : 'archived';

  return m.deadline <= now ? 'settle' : 'running';
}

/**
 * Group the records the API returned.
 *
 * `justRegistered` carries the ids this session has registered but whose sync
 * has not come back yet, so a row leaves the queue the moment its receipt
 * lands rather than on the next successful refresh.
 */
export function groupMarkets(
  predictions: readonly RedisPrediction[],
  now: number,
  justRegistered: ReadonlySet<string> = new Set()
): AdminGroups {
  const groups: AdminGroups = { proposal: [], settle: [], running: [], archived: [] };

  for (const p of predictions) {
    const market = toAdminMarket(p);
    if (justRegistered.has(market.id)) market.registered = true;
    groups[bucketOf(market, now)].push(market);
  }

  // Oldest proposal first, because a queue is worked from the front. The two
  // live piles sort by deadline, so the most overdue and the next to close are
  // both at the top of their section.
  groups.proposal.sort((a, b) => a.createdAt - b.createdAt);
  groups.settle.sort((a, b) => a.deadline - b.deadline);
  groups.running.sort((a, b) => a.deadline - b.deadline);

  return groups;
}

/** Where a market settles, which decides which handler may touch it. */
export function settlesOnChain(m: AdminMarket): boolean {
  return m.generation === CURRENT_GENERATION;
}

// ------------------------------------------------------------------ display

/** First six and last five of an address, enough to recognise, short enough to fit. */
export function shortAddress(address: string): string {
  if (!address || address.length < 14) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

/**
 * An exact instant in UTC.
 *
 * Deliberately not toLocaleString. An operator comparing a deadline against a
 * contract read needs the same clock the contract uses, and a locale string
 * quietly reports whatever timezone the browser is in.
 */
export function formatInstant(seconds: number): string {
  if (!seconds) return 'unknown';
  const iso = new Date(seconds * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** How far away an instant is, in the coarsest unit that still says something. */
export function relativeTime(seconds: number, now: number): string {
  if (!seconds) return 'unknown';
  const delta = seconds - now;
  const ago = delta < 0;
  const size = Math.abs(delta);

  const days = Math.floor(size / 86400);
  const hours = Math.floor((size % 86400) / 3600);
  const minutes = Math.floor((size % 3600) / 60);

  let span: string;
  if (days > 0) span = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  else if (hours > 0) span = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  else span = `${Math.max(minutes, 1)}m`;

  return ago ? `${span} ago` : `in ${span}`;
}

/** Raw contract units to a readable figure. */
export function formatPool(raw: number, decimals: number): string {
  const value = raw / 10 ** decimals;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
