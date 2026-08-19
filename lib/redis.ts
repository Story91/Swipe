import { Redis } from "@upstash/redis";
import { DEFAULT_CHAIN_KEY } from './chains';
import type { ChainKey } from './chains/types';
import { stakeLegs } from './userStake';
import type {
  RedisPrediction,
  RedisUserStake,
  UserTransaction,
  RedisMarketStats
} from './types/redis';

// Initialize Redis with environment variables
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error(
    'Missing Redis credentials. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.'
  );
}

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

/**
 * The chain a key belongs to, as a leading prefix.
 *
 * Every market key is per chain: two contracts number their markets from 1
 * independently, so Base market 1 and Robinhood market 1 are different markets
 * that would otherwise share one Redis record and overwrite each other.
 *
 * Base is the identity. Its keys keep exactly the shape they have today, so the
 * 244 live records need no migration, no dual read and no backfill, and this
 * change is a no-op until a second chain exists.
 *
 * Leading, not in the middle, and that is not a style choice. Redis glob `*`
 * matches `:` as well as anything else, so with the chain in the middle
 * `user_stakes:*:pred_1` would match both chains and merge another chain's
 * money into one user's answer. A leading prefix cannot do that. The rebuild
 * spec proposes the infix form; it is wrong for this reason.
 */
export function chainNamespace(chain: ChainKey = DEFAULT_CHAIN_KEY): string {
  return chain === DEFAULT_CHAIN_KEY ? '' : `${chain}:`;
}

// Redis key patterns for predictions.
//
// Keys that describe a market take a chain. Keys that describe a person and
// nothing else do not: a portfolio total or a Farcaster handle is the same fact
// whichever contract the person was betting on.
//
// USER_TRANSACTIONS looks like the second kind and is the first. Every record in
// it names a market id, a transaction hash and an explorer URL, and all three
// belong to one chain. The list was shared, so a Base user opening their history
// read Robinhood's transactions mixed into it, with market ids that mean a
// different market on the chain they are looking at and links that resolve on
// the wrong explorer. The earlier note here claimed those records carry the
// chain inside them; check lib/types/redis.ts, UserTransaction has no such
// field, so no reader could have filtered even if one had tried.
export const REDIS_KEYS = {
  PREDICTIONS: (chain?: ChainKey) => `${chainNamespace(chain)}predictions`,
  PREDICTION: (id: string, chain?: ChainKey) => `${chainNamespace(chain)}prediction:${id}`,
  /** Every prediction record on one chain, for the few routes that scan. */
  PREDICTION_PATTERN: (chain?: ChainKey) => `${chainNamespace(chain)}prediction:*`,
  PREDICTIONS_BY_CATEGORY: (category: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}predictions:category:${category}`,
  PREDICTIONS_BY_CREATOR: (creator: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}predictions:creator:${creator}`,
  PREDICTIONS_ACTIVE: (chain?: ChainKey) => `${chainNamespace(chain)}predictions:active`,
  PREDICTIONS_RESOLVED: (chain?: ChainKey) => `${chainNamespace(chain)}predictions:resolved`,
  PREDICTIONS_PENDING_APPROVAL: (chain?: ChainKey) =>
    `${chainNamespace(chain)}predictions:pending_approval`,
  PREDICTIONS_COUNT: (chain?: ChainKey) => `${chainNamespace(chain)}predictions:count`,
  /** Denormalised snapshot of every prediction, so a listing is one read. */
  PREDICTIONS_INDEX: (chain?: ChainKey) => `${chainNamespace(chain)}predictions:index`,
  /**
   * Markets the weekly routine created and has not yet resolved. The resolver
   * reads this set instead of scanning predictions:active, which still holds
   * hundreds of stale V2 ids.
   */
  ROUTINE_PENDING: (chain?: ChainKey) => `${chainNamespace(chain)}routine:pending`,
  /**
   * A wallet address, cased one way, always.
   *
   * Redis keys are bytes and 0xAbC is not 0xabc. Most writers lowercased and
   * several readers did not, so /api/portfolio built its key from the raw query
   * value: connect with a checksummed address and the portfolio came back
   * empty, with no error anywhere, because the key simply was not there.
   *
   * Normalising in the builder rather than at each of the twelve call sites is
   * the only version of this fix that cannot rot. A new caller gets it for
   * free, and a caller that already lowercases is unaffected.
   */
  USER_STAKES: (userId: string, predictionId: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}user_stakes:${userId.toLowerCase()}:${predictionId}`,
  /**
   * Every stake key for one user on one chain. The prefix is leading precisely
   * so this cannot reach across chains.
   */
  USER_STAKES_PATTERN: (userId: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}user_stakes:${userId.toLowerCase()}:*`,
  /**
   * Every stake on one market on one chain.
   *
   * This one has a `*` in the middle, where the user id goes, which is exactly
   * the shape the leading prefix makes safe. Without the prefix the glob would
   * read `user_stakes:*:pred_v3_1`, and because `*` matches ':' it would sweep
   * up `robinhood:user_stakes:0xabc:pred_v3_1` as well and add a different
   * chain's money to the answer.
   */
  PREDICTION_STAKES_PATTERN: (predictionId: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}user_stakes:*:${predictionId}`,
  /**
   * One user's transaction history on one chain.
   *
   * Namespaced like every market key, and for the same reason: the entries
   * carry market ids, and `pred_v4_1` is a different market on each chain. Base
   * stays the identity namespace, so the key production already holds is
   * unchanged and the 50-entry list a Base user reads today is the same list
   * tomorrow. Robinhood transactions written before this got their own key are
   * still sitting in Base's list. They are not lost, they are mislabelled, and
   * they age out as the cap rolls them off.
   */
  /** Lowercased for the same reason USER_STAKES is. */
  USER_TRANSACTIONS: (userId: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}user_transactions:${userId.toLowerCase()}`,
  MARKET_STATS: (chain?: ChainKey) => `${chainNamespace(chain)}market:stats`,
  COMPACT_STATS: (chain?: ChainKey) => `${chainNamespace(chain)}market:compact_stats`,
  /**
   * Cached leaderboard. Takes a chain because it is computed from one chain's
   * markets and nothing else: two chains sharing this key means whichever
   * rebuild ran last decides who the whole app thinks is winning.
   */
  REAL_LEADERBOARD: (chain?: ChainKey) => `${chainNamespace(chain)}leaderboard:real_data`,
  /** Same reasoning as the leaderboard: an aggregate of one chain's stakes. */
  LARGEST_STAKES: (timeframe: string, limit: number, chain?: ChainKey) =>
    `${chainNamespace(chain)}largest_stakes:${timeframe}:${limit}`,
  USER_PORTFOLIO: (userId: string) => `user:portfolio:${userId}`,
  SWIPE_CLAIM_HISTORY: (userId: string) => `swipe_claim_history:${userId}`,
  // Farcaster profile cache (TTL: 7 days)
  FARCASTER_PROFILE: (address: string) => `farcaster_profile:${address.toLowerCase()}`,
  /**
   * The published P&L card for one wallet on one chain.
   *
   * A card is a picture of one chain's positions, priced in that chain's
   * currency, so two chains cannot share the slot. They did. One key held one
   * image per address, the second share overwrote the first, and /api/og/pnl
   * redirected to the survivor whatever `?chain=` asked for: bet on Base,
   * share, switch to Robinhood, share again, and the Robinhood post carried
   * Base's numbers with USDC written on them.
   *
   * Base stays the identity namespace, so every card already uploaded keeps the
   * exact key it has now and nothing has to be migrated.
   */
  USER_PNL_OG_IMAGE: (address: string, chain?: ChainKey) =>
    `${chainNamespace(chain)}user:pnl:ogImageUrl:${address.toLowerCase()}`,
  /**
   * Which chain this wallet last published a card for.
   *
   * Deliberately not namespaced, and it cannot be: its value is the namespace.
   *
   * It exists because /pnl/[address] puts its metadata in a layout, and Next
   * hands a layout's generateMetadata `params` and nothing else. Check the
   * generated route types if that sounds like a detail worth arguing with:
   * .next/types/app/pnl/[address]/layout.ts declares LayoutProps as
   * `{ children, params }` while PageProps next to it also has `searchParams`.
   * So that page cannot read `?chain=` off the URL a crawler fetched, and
   * without a pointer it would read Base's key for everyone, handing a
   * Robinhood sharer the fallback hero image instead of their own card.
   */
  USER_PNL_OG_CHAIN: (address: string) => `user:pnl:ogImageChain:${address.toLowerCase()}`,
  // USDC Price history for charts
  USDC_PRICE_HISTORY: (predictionId: string, chain?: ChainKey) => `${chainNamespace(chain)}usdc:price_history:${predictionId}`,
} as const;

// Farcaster profile cache type
export interface CachedFarcasterProfile {
  fid: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  address: string;
  cached_at: number;
}

// Import types from separate file
export type { 
  RedisPrediction, 
  RedisUserStake, 
  UserTransaction, 
  RedisMarketStats 
} from './types/redis';

/** Upstash caps request size, so very large id lists are split. */
const MGET_CHUNK_SIZE = 100;

function parsePrediction(raw: unknown): RedisPrediction | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && 'id' in parsed && 'question' in parsed) {
      return parsed as RedisPrediction;
    }
  } catch {
    // A single corrupt record must not take down the whole listing.
  }
  return null;
}

function isTestPrediction(id: string, prediction: RedisPrediction): boolean {
  return (
    id.startsWith('test_') ||
    prediction.creator === 'anonymous' ||
    prediction.creator.toLowerCase().includes('test')
  );
}

/**
 * Short-lived in-process cache for the full prediction list.
 *
 * Several endpoints (/api/predictions, /api/activity, /api/market/compact-stats)
 * each re-read all 244 records per request, and a single page load hits more
 * than one of them. A few seconds of reuse collapses that to one read without
 * making anything meaningfully staler than the client's own 2-minute refresh.
 * Writes invalidate it, so a change is never hidden behind the TTL.
 */
const ALL_PREDICTIONS_TTL_MS = 10_000;
/**
 * Keyed by chain, not one shared slot.
 *
 * Vercel keeps a function warm across requests, so a single slot would serve a
 * Robinhood request whatever a Base request left there ten seconds earlier: a
 * 200, another chain's markets, and nothing in the logs to say so.
 */
const allPredictionsCache = new Map<ChainKey, { at: number; data: RedisPrediction[] }>();

/**
 * Reading a listing used to mean one Redis round trip per prediction. Batching
 * cut that to a handful; this index cuts it to one. The snapshot is rebuilt
 * only when a prediction is written or deleted, so steady-state reads never
 * touch the individual keys at all.
 */
export function invalidatePredictionsCache(chain: ChainKey = DEFAULT_CHAIN_KEY): void {
  allPredictionsCache.delete(chain);
  // Fire-and-forget: a failed delete only costs us a rebuild on the next read.
  void redis.del(REDIS_KEYS.PREDICTIONS_INDEX(chain)).catch(() => {});
}

async function readPredictionsIndex(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction[] | null> {
  try {
    const raw = await redis.get(REDIS_KEYS.PREDICTIONS_INDEX(chain));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as RedisPrediction[]) : null;
  } catch {
    return null;
  }
}

async function writePredictionsIndex(predictions: RedisPrediction[], chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
  try {
    await redis.set(REDIS_KEYS.PREDICTIONS_INDEX(chain), JSON.stringify(predictions));
  } catch (error) {
    // The index is an optimisation; failing to store it must not fail the read.
    console.error('⚠️ Failed to store predictions index:', error);
  }
}

/**
 * Batch-read predictions by id.
 *
 * This used to be one redis.get per id inside a serial loop. Against Upstash
 * every read is an HTTP round trip, so 244 predictions meant 244 sequential
 * requests — measured at ~73s for /api/market/compact-stats and ~153s for
 * /api/activity. mget in chunks turns that into a handful of round trips.
 */
async function getPredictionsByIds(ids: string[], chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction[]> {
  if (ids.length === 0) return [];

  const out: RedisPrediction[] = [];

  for (let i = 0; i < ids.length; i += MGET_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + MGET_CHUNK_SIZE);
    const keys = chunk.map((id) => REDIS_KEYS.PREDICTION(id, chain));
    const rows = (await redis.mget(...keys)) as unknown[];

    rows.forEach((row, index) => {
      const prediction = parsePrediction(row);
      if (prediction && !isTestPrediction(chunk[index], prediction)) {
        out.push(prediction);
      }
    });
  }

  return out;
}

// Helper functions for Redis operations.
//
// Every method that touches a market takes the chain that market lives on. The
// parameter is last and defaults to Base, so a caller that has not been updated
// reads and writes exactly the keys it read and wrote before namespacing
// existed. That default is the reason no live record needs migrating, and it is
// also the reason a caller that genuinely knows its chain has to say so: a
// silent default is correct for Base and wrong for everything else.
export const redisHelpers = {
  // Save prediction to Redis
  async savePrediction(prediction: RedisPrediction, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const predictionKey = REDIS_KEYS.PREDICTION(prediction.id, chain);

      // Save individual prediction
      await redis.set(predictionKey, JSON.stringify(prediction));

      // Add to predictions list. sadd returns the number of NEW members, so a
      // non-zero result means this is a first-time insert rather than a re-sync.
      const addedCount = await redis.sadd(REDIS_KEYS.PREDICTIONS(chain), prediction.id);

      // Add to category index
      await redis.sadd(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(prediction.category, chain), prediction.id);

      // Add to creator index
      await redis.sadd(REDIS_KEYS.PREDICTIONS_BY_CREATOR(prediction.creator, chain), prediction.id);

      // Move into exactly one status index. A prediction changes status over its
      // lifetime (pending -> active -> resolved), so the stale memberships must be
      // removed, otherwise it lingers in every set it has ever been in.
      const statusSets = {
        pending: REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL(chain),
        resolved: REDIS_KEYS.PREDICTIONS_RESOLVED(chain),
        active: REDIS_KEYS.PREDICTIONS_ACTIVE(chain),
      };
      const targetSet = prediction.needsApproval
        ? statusSets.pending
        : (prediction.resolved || prediction.cancelled)
          ? statusSets.resolved
          : statusSets.active;

      await redis.sadd(targetSet, prediction.id);
      await Promise.all(
        Object.values(statusSets)
          .filter(set => set !== targetSet)
          .map(set => redis.srem(set, prediction.id))
      );

      // Update count only on first insert; savePrediction is also the update path
      // and re-syncs would otherwise inflate this forever.
      if (addedCount) {
        await redis.incr(REDIS_KEYS.PREDICTIONS_COUNT(chain));
      }

      // Invalidate last, once the record and its indexes are all in place.
      // Dropping the snapshot first would let a concurrent read rebuild it from
      // the pre-write state and cache that. Only this chain's snapshot: clearing
      // every chain would throw away work that this write did not touch, and
      // clearing the wrong one would leave the stale list serving.
      invalidatePredictionsCache(chain);

      console.log(`✅ Prediction ${prediction.id} saved to Redis (${chain})`);
    } catch (error) {
      console.error('❌ Failed to save prediction to Redis:', error);
      throw error;
    }
  },

  // Get prediction by ID with live data
  async getPrediction(id: string, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction | null> {
    try {
      const predictionKey = REDIS_KEYS.PREDICTION(id, chain);
      const data = await redis.get(predictionKey);
      
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate that parsed data has required fields
      if (parsed && typeof parsed === 'object' && 'id' in parsed && 'question' in parsed) {
        return parsed as RedisPrediction;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Failed to get prediction ${id} from Redis:`, error);
      return null;
    }
  },

  // Get all predictions (only live/real predictions, exclude test data)
  async getAllPredictions(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction[]> {
    try {
      // 1. Same process, same few seconds: nothing to do.
      const cached = allPredictionsCache.get(chain);
      if (cached && Date.now() - cached.at < ALL_PREDICTIONS_TTL_MS) {
        return cached.data;
      }

      // 2. Prebuilt snapshot: one read instead of one per prediction.
      const indexed = await readPredictionsIndex(chain);
      if (indexed) {
        allPredictionsCache.set(chain, { at: Date.now(), data: indexed });
        return indexed;
      }

      // 3. Cold: rebuild from the individual keys and store the snapshot.
      const predictionIds = await redis.smembers(REDIS_KEYS.PREDICTIONS(chain));
      // The chain has to travel with the ids. Collecting them from one
      // namespace and reading them out of another is the exact collision the
      // prefix exists to prevent.
      const predictions = await getPredictionsByIds(predictionIds, chain);

      // Sort by creation date (newest first)
      const sorted = predictions.sort((a, b) => b.createdAt - a.createdAt);
      allPredictionsCache.set(chain, { at: Date.now(), data: sorted });
      await writePredictionsIndex(sorted, chain);
      return sorted;
    } catch (error) {
      console.error('❌ Failed to get all predictions from Redis:', error);
      return [];
    }
  },

  // Get active predictions (only live/real predictions, exclude test data)
  async getActivePredictions(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction[]> {
    try {
      const activeIds = await redis.smembers(REDIS_KEYS.PREDICTIONS_ACTIVE(chain));
      const currentTime = Math.floor(Date.now() / 1000);

      // The chain travels with the ids, for the same reason it does in
      // getAllPredictions: ids collected from one namespace and read out of
      // another is the collision the prefix exists to prevent.
      const predictions = (await getPredictionsByIds(activeIds, chain)).filter(
        (p) => !p.resolved && !p.cancelled && p.deadline > currentTime
      );

      return predictions.sort((a, b) => a.deadline - b.deadline); // Sort by deadline
    } catch (error) {
      console.error('❌ Failed to get active predictions from Redis:', error);
      return [];
    }
  },

  // Get predictions by category (only live/real predictions, exclude test data)
  async getPredictionsByCategory(category: string, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisPrediction[]> {
    try {
      const categoryIds = await redis.smembers(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(category, chain));
      const predictions: RedisPrediction[] = [];

      for (const id of categoryIds) {
        const prediction = await this.getPrediction(id, chain);
        if (prediction) {
          // Filter out test predictions
          const isTestPrediction = id.startsWith('test_') ||
            prediction.creator === 'anonymous' ||
            prediction.creator.toLowerCase().includes('test');

          if (!isTestPrediction) {
            predictions.push(prediction);
          }
        }
      }

      return predictions.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error(`❌ Failed to get ${category} predictions from Redis:`, error);
      return [];
    }
  },

  // Save user stake (supports both single stake and multi-token stakes)
  async saveUserStake(stake: RedisUserStake | any, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const stakeKey = REDIS_KEYS.USER_STAKES(stake.user, stake.predictionId, chain);
      await redis.set(stakeKey, JSON.stringify(stake));
      console.log(`✅ User stake saved to Redis (${chain}): ${stake.user} on ${stake.predictionId}`, stake);
    } catch (error) {
      console.error('❌ Failed to save user stake to Redis:', error);
      throw error;
    }
  },

  // Get user stakes for a prediction (supports both single and multi-token format)
  async getUserStakes(predictionId: string, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisUserStake[]> {
    try {
      // This is a simplified approach - in production you might want to use a different pattern
      // Built from REDIS_KEYS so it carries the chain prefix. A literal here
      // matches nothing once a namespace exists, and the caller reads that as
      // "no stakes" rather than as an error.
      const pattern = REDIS_KEYS.PREDICTION_STAKES_PATTERN(predictionId, chain);
      console.log(`🔍 Searching for stakes with pattern: ${pattern}`);
      const keys = await redis.keys(pattern);
      console.log(`🔍 Found keys:`, keys);
      const stakes: RedisUserStake[] = [];

      for (const key of keys) {
        const data = await redis.get(key);
        if (!data) continue;
        const stake = typeof data === 'string' ? JSON.parse(data) : data;
        // stakeLegs, not a fifth hand-written copy of the same flattening. The
        // block that stood here listed ETH and SWIPE and stopped, so a position
        // in the chain's collateral came back as no position at all, on the
        // only contracts that currently take bets.
        stakes.push(...(stakeLegs(stake) as RedisUserStake[]));
      }

      return stakes;
    } catch (error) {
      console.error(`❌ Failed to get user stakes for prediction ${predictionId}:`, error);
      return [];
    }
  },

  // Update market stats
  async updateMarketStats(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      // One scan, not two: active markets are a subset of all of them, so
      // deriving the subset in memory saves a second full read of Redis.
      const allPredictions = await this.getAllPredictions(chain);
      const currentTime = Math.floor(Date.now() / 1000);
      const activePredictions = allPredictions.filter(
        (p) => !p.resolved && !p.cancelled && p.deadline > currentTime
      );

      const stats: RedisMarketStats = {
        totalPredictions: allPredictions.length,
        totalStakes: allPredictions.reduce((sum, p) => sum + (p.totalStakes || 0), 0),
        activePredictions: activePredictions.length,
        resolvedPredictions: allPredictions.filter(p => p.resolved).length,
        totalParticipants: new Set(allPredictions.flatMap(p => p.participants || [])).size,
        lastUpdated: Date.now()
      };
      
      await redis.set(REDIS_KEYS.MARKET_STATS(chain), JSON.stringify(stats));
      console.log(`✅ Market stats updated in Redis (${chain})`);

      // Also update compact stats cache
      await this.updateCompactStats(chain);
    } catch (error) {
      console.error('❌ Failed to update market stats in Redis:', error);
    }
  },

  // Get market stats
  async getMarketStats(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<RedisMarketStats | null> {
    try {
      const data = await redis.get(REDIS_KEYS.MARKET_STATS(chain));
      
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate that parsed data has required fields
      if (parsed && typeof parsed === 'object' && 'totalPredictions' in parsed && 'totalStakes' in parsed) {
        return parsed as RedisMarketStats;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get market stats from Redis:', error);
      return null;
    }
  },

  // Save real leaderboard data
  async saveRealLeaderboardData(data: any, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const leaderboardData = {
        ...data,
        lastUpdated: Date.now(),
        timestamp: new Date().toISOString()
      };

      await redis.set(REDIS_KEYS.REAL_LEADERBOARD(chain), JSON.stringify(leaderboardData));
      console.log(`💾 Real leaderboard data saved to Redis (${chain})`);
    } catch (error) {
      console.error('❌ Failed to save real leaderboard data to Redis:', error);
      throw error;
    }
  },

  // Get real leaderboard data
  async getRealLeaderboardData(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<any | null> {
    try {
      const data = await redis.get(REDIS_KEYS.REAL_LEADERBOARD(chain));
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed;
    } catch (error) {
      console.error('❌ Failed to get real leaderboard data from Redis:', error);
      return null;
    }
  },

  // Delete prediction (for cleanup)
  async deletePrediction(id: string, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const prediction = await this.getPrediction(id, chain);
      if (!prediction) return;

      // Remove from all indexes
      await redis.srem(REDIS_KEYS.PREDICTIONS(chain), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(prediction.category, chain), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_BY_CREATOR(prediction.creator, chain), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_ACTIVE(chain), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_RESOLVED(chain), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL(chain), id);

      // Delete individual prediction
      await redis.del(REDIS_KEYS.PREDICTION(id, chain));

      // Update count
      await redis.decr(REDIS_KEYS.PREDICTIONS_COUNT(chain));

      // Invalidate last, so a concurrent read cannot cache the pre-delete state.
      invalidatePredictionsCache(chain);

      console.log(`✅ Prediction ${id} deleted from Redis`);
    } catch (error) {
      console.error(`❌ Failed to delete prediction ${id} from Redis:`, error);
      throw error;
    }
  },

  // Save user transaction
  //
  // `chain` decides which list this lands in and defaults to Base, matching
  // every other helper here. A caller that knows the chain must pass it: a
  // Robinhood bet saved without one is written into the Base history, where the
  // market id it names points at a different market.
  async saveUserTransaction(
    userId: string,
    transaction: UserTransaction,
    chain: ChainKey = DEFAULT_CHAIN_KEY
  ): Promise<void> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId, chain);
      const existingData = await redis.get(transactionsKey);
      let transactions: UserTransaction[] = [];
      
      if (existingData) {
        const parsed = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
        if (Array.isArray(parsed)) {
          transactions = parsed;
        }
      }
      
      // Add new transaction at the beginning
      transactions.unshift(transaction);
      
      // Keep only last 50 transactions
      if (transactions.length > 50) {
        transactions = transactions.slice(0, 50);
      }
      
      await redis.set(transactionsKey, JSON.stringify(transactions));
      console.log(`✅ User transaction saved: ${userId} - ${transaction.type} - ${transaction.txHash}`);
    } catch (error) {
      console.error('❌ Failed to save user transaction to Redis:', error);
      throw error;
    }
  },

  // Get user transactions
  async getUserTransactions(
    userId: string,
    chain: ChainKey = DEFAULT_CHAIN_KEY
  ): Promise<UserTransaction[]> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId, chain);
      const data = await redis.get(transactionsKey);
      
      if (!data) return [];
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (Array.isArray(parsed)) {
        return parsed as UserTransaction[];
      }
      
      return [];
    } catch (error) {
      console.error('❌ Failed to get user transactions from Redis:', error);
      return [];
    }
  },

  // Update transaction status
  async updateTransactionStatus(userId: string, txHash: string, status: 'pending' | 'success' | 'failed', blockNumber?: number, gasUsed?: number, chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId, chain);
      const data = await redis.get(transactionsKey);
      
      if (!data) return;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (Array.isArray(parsed)) {
        const transactions = parsed as UserTransaction[];
        const transaction = transactions.find(t => t.txHash === txHash);
        
        if (transaction) {
          transaction.status = status;
          if (blockNumber) transaction.blockNumber = blockNumber;
          if (gasUsed) transaction.gasUsed = gasUsed;
          
          await redis.set(transactionsKey, JSON.stringify(transactions));
          console.log(`✅ Transaction status updated: ${txHash} - ${status}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to update transaction status in Redis:', error);
    }
  },

  // Update compact stats cache
  async updateCompactStats(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<void> {
    try {
      const [marketStats, allPredictions] = await Promise.all([
        this.getMarketStats(chain),
        this.getAllPredictions(chain)
      ]);

      if (!marketStats) return;

      // Calculate ETH and SWIPE volumes from ALL predictions (V1 and V2)
      let totalETH = 0;
      let totalSWIPE = 0;
      
      allPredictions.forEach((pred) => {
        totalETH += (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0);
        totalSWIPE += (pred.swipeYesTotalAmount || 0) + (pred.swipeNoTotalAmount || 0);
      });

      // Get active predictions for additional metrics
      const activePredictions = await this.getActivePredictions(chain);
      
      // Calculate additional metrics
      const now = Math.floor(Date.now() / 1000);
      const predictionsEndingToday = activePredictions.filter(p => {
        const endDate = new Date(p.deadline * 1000);
        const today = new Date();
        return endDate.toDateString() === today.toDateString();
      }).length;

      // Get top category from active predictions
      const categoryBreakdown = activePredictions.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topCategory = Object.entries(categoryBreakdown)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'General';

      // Calculate success rate from all predictions
      const successRate = allPredictions.length > 0 
        ? (allPredictions.filter(p => p.resolved).length / allPredictions.length) * 100 
        : 0;

      // Get trending predictions from active predictions
      const trendingPredictions = activePredictions
        .map(pred => ({
          id: pred.id,
          question: pred.question,
          volumeETH: (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0),
          volumeSWIPE: (pred.swipeYesTotalAmount || 0) + (pred.swipeNoTotalAmount || 0),
          participants: pred.participants?.length || 0,
          isPositive: Math.random() > 0.5
        }))
        .sort((a, b) => (b.volumeETH + b.volumeSWIPE) - (a.volumeETH + a.volumeSWIPE))
        .slice(0, 3);

      const compactStats = {
        totalPredictions: marketStats.totalPredictions,
        activePredictions: marketStats.activePredictions,
        totalVolumeETH: totalETH,
        totalVolumeSWIPE: totalSWIPE,
        predictionsToday: predictionsEndingToday,
        topCategory,
        successRate,
        totalParticipants: marketStats.totalParticipants,
        trendingPredictions,
        lastUpdated: Date.now()
      };

      await redis.set(REDIS_KEYS.COMPACT_STATS(chain), JSON.stringify(compactStats));
      console.log(`✅ Compact stats updated in Redis (${chain})`);
    } catch (error) {
      console.error('❌ Failed to update compact stats in Redis:', error);
    }
  },

  // Get compact stats from cache
  async getCompactStats(chain: ChainKey = DEFAULT_CHAIN_KEY): Promise<any | null> {
    try {
      const data = await redis.get(REDIS_KEYS.COMPACT_STATS(chain));

      if (!data) return null;

      const parsed = typeof data === 'string' ? JSON.parse(data) : data;

      // Check if cache is fresh (less than 2 minutes old)
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
      if (parsed.lastUpdated && parsed.lastUpdated < twoMinutesAgo) {
        console.log('🔄 Compact stats cache expired, updating...');
        await this.updateCompactStats(chain);
        return await this.getCompactStats(chain);
      }
      
      return parsed;
    } catch (error) {
      console.error('❌ Failed to get compact stats from Redis:', error);
      return null;
    }
  }
};



// Export default redis instance for backward compatibility
export default redis;
