import { describe, it, expect } from 'vitest';
import { parseMarketId, marketNumber, canonicalMarketId, isV3MarketId } from './marketId';

describe('reading a market number out of a Redis id', () => {
  it('reads every generation, including the bare legacy form', () => {
    expect(parseMarketId('pred_v1_7')).toEqual({
      generation: 'v1', numericId: 7, redisId: 'pred_v1_7',
    });
    expect(parseMarketId('pred_v2_7')).toEqual({
      generation: 'v2', numericId: 7, redisId: 'pred_v2_7',
    });
    expect(parseMarketId('pred_v3_12')).toEqual({
      generation: 'v3', numericId: 12, redisId: 'pred_v3_12',
    });
    expect(parseMarketId('pred_41')).toEqual({
      generation: 'legacy', numericId: 41, redisId: 'pred_41',
    });
  });

  it('keeps two generations of the same number apart', () => {
    // pred_v1_7 and pred_v2_7 are different markets on different contracts.
    // Anything that reduces both to 7 and rebuilds one id has mixed them.
    const v1 = parseMarketId('pred_v1_7')!;
    const v2 = parseMarketId('pred_v2_7')!;
    expect(v1.numericId).toBe(v2.numericId);
    expect(v1.redisId).not.toBe(v2.redisId);
  });

  it('hands back the canonical id so nothing rebuilds a prefix by hand', () => {
    // The bug this replaces rebuilt `pred_v2_${n}` unconditionally, so a v1
    // market POSTed its price history into a v2 market's key.
    expect(parseMarketId('pred_v1_7')!.redisId).toBe('pred_v1_7');
    expect(parseMarketId('pred_41')!.redisId).toBe('pred_41');
  });
});

describe('refusing rather than guessing', () => {
  it('returns null for anything it cannot read', () => {
    for (const bad of ['', 'pred_', 'pred_v4_1', 'prediction:1', 'pred_v2_', 'pred_v2_x', 'v2_1', null, undefined, {}, []]) {
      expect(parseMarketId(bad as unknown)).toBeNull();
    }
  });

  it('never falls back to market 0', () => {
    // `parseInt('pred_v1_7'.replace('pred_v2_', ''), 10) || 0` returned 0, and 0
    // is a real on-chain id, so that fallback sent a bet to a market the user
    // never tapped.
    expect(marketNumber('pred_v1_7')).toBe(7);
    expect(marketNumber('nonsense')).toBeNull();
    expect(marketNumber('')).toBeNull();
    expect(marketNumber(undefined)).toBeNull();
  });

  it('still reads a genuine market 0, because 0 is a valid id', () => {
    // The distinction that makes `|| 0` wrong in both directions.
    expect(parseMarketId('pred_v3_0')!.numericId).toBe(0);
    expect(marketNumber('pred_v3_0')).toBe(0);
    expect(marketNumber(0)).toBe(0);
  });

  it('accepts a number the admin paths already hold, and rejects a broken one', () => {
    expect(marketNumber(41)).toBe(41);
    expect(marketNumber(-1)).toBeNull();
    expect(marketNumber(1.5)).toBeNull();
    expect(marketNumber(Number.NaN)).toBeNull();
  });

  it('refuses a number too large to survive a round trip', () => {
    expect(parseMarketId('pred_v3_9007199254740993')).toBeNull();
  });
});

describe('building an id', () => {
  it('round-trips every generation', () => {
    for (const g of ['v1', 'v2', 'v3', 'legacy'] as const) {
      const id = canonicalMarketId(g, 9);
      const parsed = parseMarketId(id)!;
      expect(parsed.generation).toBe(g);
      expect(parsed.numericId).toBe(9);
    }
  });

  it('tells the current generation apart from the archived ones', () => {
    expect(isV3MarketId('pred_v3_1')).toBe(true);
    expect(isV3MarketId('pred_v2_1')).toBe(false);
    expect(isV3MarketId('pred_1')).toBe(false);
    expect(isV3MarketId(1)).toBe(false);
  });
});
