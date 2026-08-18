import { describe, it, expect, beforeAll } from 'vitest';

/**
 * The transaction history was the one key in lib/redis.ts that reached across
 * chains.
 *
 * Every other market key had already been given a leading chain prefix, with
 * Base as the identity namespace. USER_TRANSACTIONS was left global on the
 * argument that a history is a fact about a person rather than about a market,
 * and that the records carry their chain inside them. The second half of that
 * was never true: UserTransaction in lib/types/redis.ts has an id, a market id,
 * a hash, an explorer URL and an amount, and no chain anywhere. So the two
 * chains shared one 50-entry list, and a Base user's history showed Robinhood
 * bets whose `predictionId` names a different market on the chain they are
 * looking at.
 *
 * lib/redis.ts throws at import time without Upstash credentials, so they are
 * stubbed before the dynamic import. Nothing here touches a live Redis.
 */
let REDIS_KEYS: typeof import('./redis')['REDIS_KEYS'];

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  const mod = await import('./redis');
  REDIS_KEYS = mod.REDIS_KEYS;
});

describe('the transaction history key', () => {
  it('is unchanged on Base, so no live record is stranded', () => {
    // This is what production holds today. If it moves, every existing history
    // becomes unreachable and the fix is a backfill rather than a revert.
    expect(REDIS_KEYS.USER_TRANSACTIONS('0xabc')).toBe('user_transactions:0xabc');
    expect(REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'base')).toBe('user_transactions:0xabc');
  });

  it('gives another chain its own list', () => {
    expect(REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'robinhood')).toBe(
      'robinhood:user_transactions:0xabc'
    );
    expect(REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'base')).not.toBe(
      REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'robinhood')
    );
  });

  it('puts the chain first, the same way every other key does', () => {
    // Leading rather than infixed, for the reason the stake keys are: Redis
    // glob `*` matches ':' as well, so a chain in the middle lets one pattern
    // sweep up both chains.
    const key = REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'robinhood');
    expect(key.startsWith('robinhood:')).toBe(true);
    expect(key.indexOf('robinhood:')).toBe(0);
  });

  it('matches the namespace the market keys use for the same chain', () => {
    // One rule, not two. A history prefixed differently from the predictions it
    // refers to is the same bug in a new place.
    const marketKey = REDIS_KEYS.PREDICTION('pred_v4_1', 'robinhood');
    const historyKey = REDIS_KEYS.USER_TRANSACTIONS('0xabc', 'robinhood');
    const prefix = marketKey.slice(0, marketKey.indexOf('prediction:'));
    expect(historyKey.startsWith(prefix)).toBe(true);
  });
});
