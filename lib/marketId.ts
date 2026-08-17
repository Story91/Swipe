/**
 * Reading the on-chain market number out of a Redis prediction id.
 *
 * Redis ids carry the contract generation that minted them: `pred_v1_7`,
 * `pred_v2_7`, `pred_v3_7`, and a few early records are a bare `pred_7`. The
 * number after the prefix is the id the contract knows, and it is per
 * generation: `pred_v1_7` and `pred_v2_7` are two different markets that happen
 * to share the number 7.
 *
 * This exists because four call sites derived that number four different ways
 * and disagreed:
 *
 *   - one stripped v2, v1 and the bare prefix, so it read `pred_v1_7` as 7
 *   - one stripped only v2 and fell back with `|| 0`, so the same record became
 *     market 0, and 0 was handed to placeBet
 *   - one bailed on NaN, so it silently skipped the sync for the same record
 *   - one rebuilt the id as `pred_v2_${n}` unconditionally, so a v1 market wrote
 *     its price history into a v2 market's Redis key
 *
 * The rules here: never guess, never return 0 as a fallback, and hand back the
 * canonical id so nothing has to rebuild a prefix by hand.
 */

export type MarketGeneration = 'v1' | 'v2' | 'v3' | 'legacy';

export interface MarketRef {
  /** Which contract generation minted this market. */
  generation: MarketGeneration;
  /** The id the contract knows. Unique only within a generation. */
  numericId: number;
  /** The canonical Redis id. Use this instead of rebuilding a prefix. */
  redisId: string;
}

const PATTERN = /^pred_(?:(v1|v2|v3)_)?(\d+)$/;

/**
 * Parse a Redis prediction id, or null if it is not one.
 *
 * Null means "I do not know which market this is", and every caller must treat
 * it as a refusal. It is never 0, because 0 is a valid on-chain market id and a
 * plausible-looking wrong answer is worse than no answer.
 */
export function parseMarketId(id: unknown): MarketRef | null {
  if (typeof id !== 'string') return null;

  const match = PATTERN.exec(id.trim());
  if (!match) return null;

  const generation = (match[1] ?? 'legacy') as MarketGeneration;
  const numericId = Number(match[2]);

  // Number() on a long digit run silently loses precision past 2^53. An id that
  // cannot survive a round trip is not an id we can act on.
  if (!Number.isSafeInteger(numericId)) return null;

  return { generation, numericId, redisId: canonicalMarketId(generation, numericId) };
}

/**
 * Just the number, for callers that only need to address the contract.
 *
 * Accepts a number as-is, because some admin paths already hold one. Returns
 * null rather than a fallback for anything else.
 */
export function marketNumber(id: unknown): number | null {
  if (typeof id === 'number') {
    return Number.isSafeInteger(id) && id >= 0 ? id : null;
  }
  return parseMarketId(id)?.numericId ?? null;
}

/** The Redis id for a market, built in exactly one place. */
export function canonicalMarketId(generation: MarketGeneration, numericId: number): string {
  return generation === 'legacy' ? `pred_${numericId}` : `pred_${generation}_${numericId}`;
}

/** True when this id belongs to the current contract generation. */
export function isV3MarketId(id: unknown): boolean {
  return parseMarketId(id)?.generation === 'v3';
}
