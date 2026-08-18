import { describe, it, expect, beforeAll } from 'vitest';

/**
 * One wallet, one card, one chain.
 *
 * The P&L card is a picture of one chain's positions priced in that chain's
 * currency, and it used to be stored under `user:pnl:ogImageUrl:<address>` with
 * no chain in it. So a wallet had one card for both chains: bet on Base, share,
 * switch to Robinhood, share again, and the second post carried the first
 * chain's numbers. /api/og/pnl redirected to it before reading `?chain=`, so
 * even an explicit request for the other chain got the wrong picture.
 *
 * Same import dance as redisKeys.test.ts: lib/redis.ts throws at import time
 * without Upstash credentials, so they are stubbed before the dynamic import.
 * Nothing here talks to Redis, these are key-shape assertions.
 */
let REDIS_KEYS: typeof import('./redis')['REDIS_KEYS'];

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  const mod = await import('./redis');
  REDIS_KEYS = mod.REDIS_KEYS;
});

const WALLET = '0xabcdef0123456789abcdef0123456789abcdef01';

describe('the P&L card key', () => {
  it('leaves Base exactly where it is, so no published card is stranded', () => {
    // Every card uploaded before namespacing lives at this string. If it moves,
    // every share link posted so far falls back to hero.png and the fix is a
    // backfill rather than a revert.
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET)).toBe(`user:pnl:ogImageUrl:${WALLET}`);
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, 'base')).toBe(
      REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET)
    );
  });

  it('gives another chain its own slot', () => {
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, 'robinhood')).toBe(
      `robinhood:user:pnl:ogImageUrl:${WALLET}`
    );
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, 'robinhoodTestnet')).toBe(
      `robinhoodTestnet:user:pnl:ogImageUrl:${WALLET}`
    );
  });

  it('cannot serve one wallet the same card on two chains', () => {
    // The bug itself, stated as an assertion.
    const chains = ['base', 'robinhood', 'robinhoodTestnet'] as const;
    const keys = chains.map((c) => REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, c));
    expect(new Set(keys).size).toBe(chains.length);
  });

  it('puts the chain first, so a scan of one chain cannot reach another', () => {
    // Redis `*` matches ':' as well as anything else. With the chain anywhere
    // but the front, a glob over Base's cards would sweep up Robinhood's too.
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, 'robinhood')).toMatch(/^robinhood:/);
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET, 'base')).not.toContain('robinhood');
  });

  it('builds one key from either casing of the address', () => {
    const MIXED = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(MIXED, 'robinhood')).toBe(
      REDIS_KEYS.USER_PNL_OG_IMAGE(MIXED.toLowerCase(), 'robinhood')
    );
    expect(REDIS_KEYS.USER_PNL_OG_IMAGE(MIXED)).not.toContain('AbC');
  });
});

describe('the pointer that says which card /pnl/[address] embeds', () => {
  /**
   * This one holds a chain name, so namespacing it by chain would be circular:
   * you would have to know the answer to build the key that stores it.
   *
   * It exists because /pnl/[address] generates its metadata in a layout, and
   * Next hands a layout `params` only. See the note on the key in lib/redis.ts.
   */
  it('is one key per wallet, with no chain in it', () => {
    expect(REDIS_KEYS.USER_PNL_OG_CHAIN(WALLET)).toBe(`user:pnl:ogImageChain:${WALLET}`);
  });

  it('is a different key from the card itself', () => {
    expect(REDIS_KEYS.USER_PNL_OG_CHAIN(WALLET)).not.toBe(REDIS_KEYS.USER_PNL_OG_IMAGE(WALLET));
  });

  it('lowercases the address the way every other wallet key does', () => {
    const MIXED = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
    expect(REDIS_KEYS.USER_PNL_OG_CHAIN(MIXED)).toBe(REDIS_KEYS.USER_PNL_OG_CHAIN(WALLET));
  });
});
