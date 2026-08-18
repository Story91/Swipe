import { describe, it, expect, beforeAll } from 'vitest';

/**
 * predictionLikes imports chainNamespace from lib/redis, which throws at import
 * time without Upstash credentials, so they are stubbed before the dynamic
 * import. Same pattern as redisKeys.test.ts. Nothing here touches a live Redis.
 */
let predictionLikesKey: typeof import('./predictionLikes')['predictionLikesKey'];
let normaliseLiker: typeof import('./predictionLikes')['normaliseLiker'];
let isAddressLike: typeof import('./predictionLikes')['isAddressLike'];

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  const mod = await import('./predictionLikes');
  predictionLikesKey = mod.predictionLikesKey;
  normaliseLiker = mod.normaliseLiker;
  isAddressLike = mod.isAddressLike;
});

/**
 * Likes on a proposed market, and the two ways a counter like this goes wrong.
 *
 * One: the key forgets the chain. Both deployments number their markets from 1,
 * so market 5 on Base and market 5 on Robinhood are unrelated questions, and a
 * shared key would show one proposal's support on the other's card. Every other
 * key about a market carries the namespace and so does this one.
 *
 * Two: the address arrives cased differently through two paths and one person
 * likes the same proposal twice. That exact bug emptied portfolios earlier in
 * this repo, when USER_STAKES built its key from the raw address while every
 * writer lowercased.
 */

const MIXED = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
const LOWER = MIXED.toLowerCase();

describe('the key a like is stored under', () => {
  it('keeps the two chains apart', () => {
    expect(predictionLikesKey('5', 'base')).not.toBe(predictionLikesKey('5', 'robinhood'));
    expect(predictionLikesKey('5', 'robinhood')).toMatch(/^robinhood:/);
  });

  it('leaves Base unprefixed, the way chainNamespace does', () => {
    expect(predictionLikesKey('5', 'base')).toBe('prediction:likes:5');
    // No argument means Base, so an older caller cannot land somewhere new.
    expect(predictionLikesKey('5')).toBe(predictionLikesKey('5', 'base'));
  });

  it('keeps two markets apart on one chain', () => {
    expect(predictionLikesKey('5', 'base')).not.toBe(predictionLikesKey('6', 'base'));
  });
});

describe('who counts as one liker', () => {
  it('treats either casing as the same person', () => {
    expect(normaliseLiker(MIXED)).toBe(normaliseLiker(LOWER));
    expect(normaliseLiker(MIXED)).toBe(LOWER);
  });

  it('ignores whitespace a form might send', () => {
    expect(normaliseLiker(`  ${MIXED} `)).toBe(LOWER);
  });
});

describe('what is allowed to vote', () => {
  it('accepts an address in either casing', () => {
    expect(isAddressLike(MIXED)).toBe(true);
    expect(isAddressLike(LOWER)).toBe(true);
    expect(isAddressLike(` ${MIXED} `)).toBe(true);
  });

  it('rejects anything that is not one', () => {
    // Short, long, missing prefix, not hex, and the shapes a bad client sends.
    expect(isAddressLike('0x123')).toBe(false);
    expect(isAddressLike(`${MIXED}00`)).toBe(false);
    expect(isAddressLike(LOWER.slice(2))).toBe(false);
    expect(isAddressLike('0xZZCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe(false);
    expect(isAddressLike('')).toBe(false);
    expect(isAddressLike(null)).toBe(false);
    expect(isAddressLike(undefined)).toBe(false);
    expect(isAddressLike(42)).toBe(false);
    expect(isAddressLike({ address: MIXED })).toBe(false);
  });
});
