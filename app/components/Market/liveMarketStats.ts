import type { PublicClient } from 'viem';
import { createChainPublicClient } from '@/lib/chains';
import { getMarketContract, type MarketContract } from '@/lib/chains/market';
import {
  MARKET_PROBE_LIMIT,
  MULTICALL3_ADDRESS,
  readChainStats,
  type ChainStats,
} from '@/lib/chains/chainSummary';
import type { ChainKey } from '@/lib/chains/types';
import { toDisplayUnits } from '@/lib/userStake';

/**
 * What the stats tab can actually know, and where each number comes from.
 *
 * The tab used to read one Redis cache and print four tiles from it: an ETH
 * total, a $SWIPE total, a win rate and an average stake. Two of those were
 * hardcoded in the markup (0.00045 and 14.3K), one was a resolution rate
 * labelled as a win rate, and the trending list sorted by `volumeETH +
 * volumeSWIPE`, which adds wei to wei of a different token and means nothing.
 * The ETH and $SWIPE figures were real but archived: both come from contracts
 * whose owner key is gone, and neither is denominated in the stablecoin the
 * live market settles in.
 *
 * So the live half is read from the contract instead. Fees can be changed after
 * deploy, minBet is denominated in a collateral the contract names itself, and
 * the pools are the only place the current money is. A cache cannot go stale in
 * a way nobody notices if there is no cache.
 *
 * What this deliberately does NOT produce is a lifetime volume. That needs the
 * event log, and eth_getLogs from block 0 against the public Base RPC fails
 * outright, which is the same reason chainSummary counts markets by probing ids
 * rather than by reading PredictionRegistered. `staked` below is what is in the
 * pools right now, and it goes down when somebody exits early.
 */

/** One registered market, reduced to the fields this page needs. */
export interface MarketRow {
  /** Unix seconds. */
  deadline: number;
  /** Raw collateral units, as the contract stores them. */
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  cancelled: boolean;
  participants: number;
}

/**
 * Field order of the `predictions(id)` public getter, which is the struct's own
 * declaration order in PredictionMarket_V4.sol. Named here because a bare
 * `row[15]` two screens down is unreadable and a reordered struct would move it
 * silently.
 */
const FIELD = {
  registered: 0,
  deadline: 2,
  yesPool: 3,
  noPool: 4,
  resolved: 7,
  cancelled: 8,
  participantCount: 15,
} as const;

/** How many values that getter returns. A shorter tuple is a different ABI. */
const FIELD_COUNT = 16;

/**
 * One multicall entry turned into a row, or null when there is no market there.
 *
 * Null covers three different things on purpose: the call failed, the id was
 * never handed out, or the id belongs to the other chain. All three mean the
 * same to a counter, and none of them may be counted as a market with empty
 * pools, which would report an id space as a market list.
 */
export function decodeMarket(entry: unknown): MarketRow | null {
  if (!entry || typeof entry !== 'object') return null;
  const call = entry as { status?: string; result?: unknown };
  if (call.status !== 'success' || !Array.isArray(call.result)) return null;

  const row = call.result as unknown[];
  if (row.length < FIELD_COUNT) return null;
  if (row[FIELD.registered] !== true) return null;

  return {
    deadline: Number(row[FIELD.deadline]),
    yesPool: BigInt(row[FIELD.yesPool] as bigint),
    noPool: BigInt(row[FIELD.noPool] as bigint),
    resolved: row[FIELD.resolved] === true,
    cancelled: row[FIELD.cancelled] === true,
    participants: Number(row[FIELD.participantCount]),
  };
}

/** Every market on one chain, counted by state. */
export interface MarketRollup {
  registered: number;
  /** Still taking bets. */
  open: number;
  /** Closed to bets, no outcome recorded yet. */
  awaiting: number;
  settled: number;
  cancelled: number;
  /** Raw collateral units sitting in the pools now, across every market. */
  staked: bigint;
  /** Distinct backers, summed per market, so one person on two markets is two. */
  backers: number;
  /** True when the probe window filled up, so every count is "at least". */
  countIsFloor: boolean;
}

/**
 * Reduce decoded rows to the counts the page prints.
 *
 * A market is in exactly one state, and the order of the tests is the contract's
 * own precedence: cancelled markets never resolve, resolved ones are past their
 * deadline by definition, and everything else turns on the clock.
 *
 * `backers` is a sum of per-market participantCount, not a headcount of people.
 * The contract does not expose a cross-market set and building one would mean
 * pulling every participant list, so the honest name for this is backers rather
 * than users, and the page says so.
 */
export function rollupMarkets(
  rows: readonly (MarketRow | null)[],
  now: number
): MarketRollup {
  let registered = 0;
  let open = 0;
  let awaiting = 0;
  let settled = 0;
  let cancelled = 0;
  let staked = BigInt(0);
  let backers = 0;

  for (const row of rows) {
    if (!row) continue;
    registered += 1;
    staked += row.yesPool + row.noPool;
    backers += row.participants;

    if (row.cancelled) cancelled += 1;
    else if (row.resolved) settled += 1;
    else if (row.deadline > now) open += 1;
    else awaiting += 1;
  }

  // The last id in the window being a real market means the window ran out, not
  // that the chain stopped there.
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    registered,
    open,
    awaiting,
    settled,
    cancelled,
    staked,
    backers,
    countIsFloor: last !== null,
  };
}

export interface LiveMarketStats {
  /** Fees, minimum bet and collateral, read from this chain's contract. */
  chain: ChainStats;
  markets: MarketRollup;
}

/**
 * Read one chain's live market picture.
 *
 * `client`, `probeLimit` and `now` exist for tests. In the app the client comes
 * from createChainPublicClient, which carries that chain's configured RPC.
 *
 * Throws when the chain has no market deployed. That is not an error state to
 * paper over, it is an answer, and the caller renders it as one.
 */
export async function readLiveMarketStats(
  key: ChainKey,
  opts: { client?: PublicClient; probeLimit?: number; now?: number } = {}
): Promise<LiveMarketStats> {
  const market = getMarketContract(key);
  if (!market) throw new Error(`No Swipe market is deployed on ${key}.`);

  const client = opts.client ?? createChainPublicClient(key);
  const probeLimit = opts.probeLimit ?? MARKET_PROBE_LIMIT;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  const [chain, entries] = await Promise.all([
    // readChainStats runs its own registered-market probe, and this function
    // needs the whole row of every market anyway. So its probe is narrowed to a
    // single id and its marketCount is discarded: the count the page shows comes
    // off the same rows as the pools, which means the two cannot disagree.
    readChainStats(key, { probeLimit: 1 }),
    probeMarkets(client, market, probeLimit),
  ]);

  return { chain, markets: rollupMarkets(entries.map(decodeMarket), now) };
}

async function probeMarkets(
  client: PublicClient,
  market: MarketContract,
  limit: number
): Promise<readonly unknown[]> {
  const ids = Array.from({ length: limit }, (_, i) => BigInt(i + 1));
  return client.multicall({
    contracts: ids.map((id) => ({
      address: market.address,
      abi: market.abi,
      functionName: 'predictions',
      args: [id],
    })),
    allowFailure: true,
    // Passed explicitly because the Robinhood chain definitions declare no
    // contracts, and viem refuses a multicall without an address.
    multicallAddress: MULTICALL3_ADDRESS,
  });
}

/** The two archived legs, in readable units, kept apart. */
export interface ArchivedVolume {
  eth: number;
  swipe: number;
}

/**
 * The old contracts' volume out of /api/market/compact-stats.
 *
 * Only the ETH and $SWIPE legs are taken. The collateral leg of a market is
 * stored under its own `usdc*` fields by /api/sync/usdc, so these two carry the
 * archived era and nothing from the live contract, and they stay two numbers.
 * Adding them would put 18 decimals of one token on top of 18 decimals of
 * another and call the result a total.
 *
 * Null when there is nothing archived on this chain, so the caller leaves the
 * section out rather than printing a row of zeros about contracts that were
 * never deployed there.
 */
export function archivedVolume(payload: unknown): ArchivedVolume | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { success?: unknown; data?: unknown };
  if (body.success !== true || !body.data || typeof body.data !== 'object') return null;

  const data = body.data as Record<string, unknown>;
  const eth = toDisplayUnits(Number(data.totalVolumeETH) || 0, 'ETH');
  const swipe = toDisplayUnits(Number(data.totalVolumeSWIPE) || 0, 'SWIPE');
  if (eth <= 0 && swipe <= 0) return null;

  return { eth, swipe };
}
