import { describe, it, expect, beforeAll } from 'vitest';

/**
 * lib/redis.ts throws at import time without Upstash credentials, so they are
 * stubbed before the dynamic import. Nothing here touches a live Redis: these
 * are pure key-shape assertions.
 */
let REDIS_KEYS: typeof import('./redis')['REDIS_KEYS'];
let chainNamespace: typeof import('./redis')['chainNamespace'];

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  const mod = await import('./redis');
  REDIS_KEYS = mod.REDIS_KEYS;
  chainNamespace = mod.chainNamespace;
});

describe('Base keys are unchanged, so no record has to be migrated', () => {
  // This is the whole argument for base-as-identity over a migration. If any of
  // these shift, 244 live records stop being findable and the fix is a backfill
  // rather than a revert.
  it('produces exactly the keys production already holds', () => {
    expect(REDIS_KEYS.PREDICTION('pred_v2_224')).toBe('prediction:pred_v2_224');
    expect(REDIS_KEYS.PREDICTIONS()).toBe('predictions');
    expect(REDIS_KEYS.PREDICTIONS_ACTIVE()).toBe('predictions:active');
    expect(REDIS_KEYS.PREDICTIONS_RESOLVED()).toBe('predictions:resolved');
    expect(REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL()).toBe('predictions:pending_approval');
    expect(REDIS_KEYS.PREDICTIONS_COUNT()).toBe('predictions:count');
    expect(REDIS_KEYS.PREDICTIONS_INDEX()).toBe('predictions:index');
    expect(REDIS_KEYS.PREDICTIONS_BY_CATEGORY('Crypto')).toBe('predictions:category:Crypto');
    expect(REDIS_KEYS.USER_STAKES('0xabc', 'pred_v2_224')).toBe('user_stakes:0xabc:pred_v2_224');
    expect(REDIS_KEYS.MARKET_STATS()).toBe('market:stats');
    expect(REDIS_KEYS.USDC_PRICE_HISTORY('pred_v2_224')).toBe('usdc:price_history:pred_v2_224');
  });

  it('gives the same answer whether Base is named or left implicit', () => {
    expect(REDIS_KEYS.PREDICTION('pred_v3_1', 'base')).toBe(REDIS_KEYS.PREDICTION('pred_v3_1'));
    expect(chainNamespace('base')).toBe('');
    expect(chainNamespace()).toBe('');
  });
});

describe('another chain gets its own keyspace', () => {
  it('prefixes every market key', () => {
    expect(REDIS_KEYS.PREDICTION('pred_v3_1', 'robinhood')).toBe('robinhood:prediction:pred_v3_1');
    expect(REDIS_KEYS.PREDICTIONS('robinhood')).toBe('robinhood:predictions');
    expect(REDIS_KEYS.PREDICTIONS_INDEX('robinhood')).toBe('robinhood:predictions:index');
    expect(REDIS_KEYS.PREDICTIONS_COUNT('robinhood')).toBe('robinhood:predictions:count');
  });

  it('keeps market 1 on two chains apart', () => {
    // The failure this exists to prevent: two contracts number their markets
    // from 1 independently, and one shared record means the later sync wins.
    expect(REDIS_KEYS.PREDICTION('pred_v3_1', 'base')).not.toBe(
      REDIS_KEYS.PREDICTION('pred_v3_1', 'robinhood')
    );
  });

  it('puts the chain first, so a glob cannot cross chains', () => {
    // Redis `*` matches ':' too. With the chain in the middle,
    // `user_stakes:*:pred_v3_1` would match both chains and merge another
    // chain's money into one user's answer. Leading, it cannot.
    const pattern = REDIS_KEYS.USER_STAKES_PATTERN('0xabc');
    const baseKey = REDIS_KEYS.USER_STAKES('0xabc', 'pred_v3_1');
    const otherKey = REDIS_KEYS.USER_STAKES('0xabc', 'pred_v3_1', 'robinhood');

    const asRegex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    expect(asRegex.test(baseKey)).toBe(true);
    expect(asRegex.test(otherKey)).toBe(false);

    const otherPattern = REDIS_KEYS.USER_STAKES_PATTERN('0xabc', 'robinhood');
    const otherRegex = new RegExp('^' + otherPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    expect(otherRegex.test(otherKey)).toBe(true);
    expect(otherRegex.test(baseKey)).toBe(false);
  });
});

describe('keys about a person stay global', () => {
  it('does not split one user across chains', () => {
    // USER_TRANSACTIONS is capped at 50 entries and read as one list, so
    // namespacing it would silently halve a user's visible history.
    expect(REDIS_KEYS.USER_TRANSACTIONS('0xabc')).toBe('user_transactions:0xabc');
    expect(REDIS_KEYS.USER_PORTFOLIO('0xabc')).toBe('user:portfolio:0xabc');
    expect(REDIS_KEYS.FARCASTER_PROFILE('0xABC')).toBe('farcaster_profile:0xabc');
  });
});
