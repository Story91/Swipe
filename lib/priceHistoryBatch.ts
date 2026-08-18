import { parseMarketId } from './marketId';

/**
 * The id list a batched price-history read is allowed to ask for.
 *
 * The grid draws a sparkline on every card, and one request per card is 24
 * round trips to Upstash for one page. `redis.mget` answers all of them in one,
 * so the only thing left to decide is how long the list may be.
 *
 * Fifty. The desktop grid pages at 24, so a page fits twice over with room for
 * a future denser layout, and fifty keys is still a single mget rather than the
 * chunked loop lib/redis.ts needs for the whole prediction index. It is a cap
 * on work a stranger can ask for in one request, so it is checked before the
 * duplicates are removed: a list of 200 repeats of the same id is a request to
 * parse 200 tokens whatever it collapses to.
 *
 * Kept in lib/ rather than beside the route because the client imports the cap
 * from here too. Two numbers that must agree, written once.
 */
export const MAX_BATCH_IDS = 50;

/** The query parameter carrying the list. */
export const BATCH_IDS_PARAM = 'ids';

export type BatchIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Turn `?ids=pred_v4_1,pred_v4_2` into canonical market ids, or say why not.
 *
 * Every id goes through parseMarketId, for the same reason the single route's
 * POST does: the string becomes a Redis key, and an id nobody can parse is an
 * id nobody can honestly answer for. Returning an empty history for it would be
 * indistinguishable from "this market has no history yet", which is a different
 * statement and a false one. So the whole request is refused instead.
 *
 * The ids come back canonical, in first-seen order, with duplicates removed,
 * because the canonical id is what the Redis key is built from and what the
 * response is keyed by.
 */
export function parseBatchIds(raw: string | null | undefined): BatchIdsResult {
  const missing = `No market ids given. Pass ?${BATCH_IDS_PARAM}=pred_v4_1,pred_v4_2, at most ${MAX_BATCH_IDS} per request.`;

  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: missing };
  }

  const tokens = raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');

  if (tokens.length === 0) {
    return { ok: false, error: missing };
  }

  if (tokens.length > MAX_BATCH_IDS) {
    return {
      ok: false,
      error: `Too many market ids. At most ${MAX_BATCH_IDS} per request.`,
    };
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const parsed = parseMarketId(token);
    if (!parsed) {
      // The rejected token is deliberately not echoed, same as the chain
      // parameter's error. Nothing good comes of reflecting caller text back
      // out of an endpoint, and the shape we do accept is the useful half.
      return {
        ok: false,
        error: 'Every id must be a market id, like pred_v4_12.',
      };
    }
    if (seen.has(parsed.redisId)) continue;
    seen.add(parsed.redisId);
    ids.push(parsed.redisId);
  }

  return { ok: true, ids };
}
