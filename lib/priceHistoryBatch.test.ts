import { describe, it, expect } from 'vitest';
import { parseBatchIds, MAX_BATCH_IDS } from './priceHistoryBatch';

/**
 * The id list on the batched price-history read.
 *
 * Two things are being pinned. The cap, because it is the only bound on how
 * much work one request can ask Upstash for, and the refusal, because an id
 * nobody can parse must not come back as an empty history: the grid draws an
 * empty history as "this market has no odds recorded yet", which is a claim,
 * and it would be a false one.
 */

const idsOf = (raw: string | null | undefined) => {
  const result = parseBatchIds(raw);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.ids;
};

const errorOf = (raw: string | null | undefined) => {
  const result = parseBatchIds(raw);
  if (result.ok) throw new Error(`expected a refusal, got: ${result.ids.join(',')}`);
  return result.error;
};

describe('parseBatchIds', () => {
  it('reads a comma separated list in the order it was given', () => {
    expect(idsOf('pred_v4_3,pred_v4_1,pred_v4_2')).toEqual([
      'pred_v4_3',
      'pred_v4_1',
      'pred_v4_2',
    ]);
  });

  it('trims whitespace and ignores empty slots', () => {
    expect(idsOf(' pred_v4_1 , ,pred_v4_2,')).toEqual(['pred_v4_1', 'pred_v4_2']);
  });

  it('keeps the first of a repeated id, so one key is read once', () => {
    expect(idsOf('pred_v4_1,pred_v4_2,pred_v4_1')).toEqual(['pred_v4_1', 'pred_v4_2']);
  });

  it('returns the canonical id, which is what the Redis key is built from', () => {
    // pred_v4_007 and pred_v4_7 are the same market, and mget must not be asked
    // for two keys where one of them can never exist.
    expect(idsOf('pred_v4_007')).toEqual(['pred_v4_7']);
    expect(idsOf('pred_v4_007,pred_v4_7')).toEqual(['pred_v4_7']);
    // The early records with no generation in them are still real ids.
    expect(idsOf('pred_9')).toEqual(['pred_9']);
  });

  it('accepts older generations, which have histories worth drawing', () => {
    expect(idsOf('pred_v1_4,pred_v2_4,pred_v3_4,pred_v4_4')).toEqual([
      'pred_v1_4',
      'pred_v2_4',
      'pred_v3_4',
      'pred_v4_4',
    ]);
  });

  it('refuses a missing or empty list rather than reading nothing successfully', () => {
    expect(errorOf(null)).toContain(`${MAX_BATCH_IDS}`);
    expect(errorOf(undefined)).toContain('No market ids');
    expect(errorOf('')).toContain('No market ids');
    expect(errorOf('   ')).toContain('No market ids');
    expect(errorOf(',,,')).toContain('No market ids');
  });

  it('accepts exactly the cap', () => {
    const ids = Array.from({ length: MAX_BATCH_IDS }, (_, i) => `pred_v4_${i + 1}`);
    expect(idsOf(ids.join(','))).toHaveLength(MAX_BATCH_IDS);
  });

  it('refuses one over the cap, and says what the cap is', () => {
    const ids = Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => `pred_v4_${i + 1}`);
    const error = errorOf(ids.join(','));
    expect(error).toContain('Too many');
    expect(error).toContain(`${MAX_BATCH_IDS}`);
  });

  it('counts the tokens, not what they collapse to', () => {
    // A list of the same id repeated past the cap is still a list past the cap.
    // Deduplicating first would let one request carry any number of tokens.
    const ids = Array.from({ length: MAX_BATCH_IDS + 1 }, () => 'pred_v4_1');
    expect(errorOf(ids.join(','))).toContain('Too many');
  });

  it('refuses an id it cannot parse rather than answering with an empty history', () => {
    for (const bad of [
      'pred_v4_1,../../etc/passwd',
      'usdc:price_history:*',
      'pred_v5_1',
      'pred_v4_',
      'pred_v4_1x',
      '__proto__',
      'pred_v4_1 pred_v4_2',
    ]) {
      expect(errorOf(bad)).toContain('must be a market id');
    }
  });

  it('does not echo the rejected text back out of the endpoint', () => {
    expect(errorOf('<script>alert(1)</script>')).not.toContain('script');
  });
});
