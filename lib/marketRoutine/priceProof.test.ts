import { describe, it, expect } from 'vitest';
import { proofUrl, fetchObservation, evaluateOutcome } from './priceProof';
import type { ResolutionSpec } from '@/lib/types/redis';

const geckoSpec: ResolutionSpec = {
  source: 'geckoterminal',
  network: 'base',
  poolAddress: '0xaeropool',
  comparator: 'above',
  threshold: 0.49,
  template: 'price_at_close',
};

const dexSpec: ResolutionSpec = {
  ...geckoSpec,
  source: 'dexscreener',
  network: 'robinhood',
  poolAddress: '0xcashcatpair',
  threshold: 0.085,
};

describe('proofUrl', () => {
  it('targets the exact pool each source knows', () => {
    expect(proofUrl(geckoSpec)).toBe(
      'https://api.geckoterminal.com/api/v2/networks/base/pools/0xaeropool'
    );
    expect(proofUrl(dexSpec)).toBe(
      'https://api.dexscreener.com/latest/dex/pairs/robinhood/0xcashcatpair'
    );
  });
});

describe('fetchObservation', () => {
  it('reads a GeckoTerminal pool price', async () => {
    const obs = await fetchObservation(
      geckoSpec,
      async () => ({ data: { attributes: { base_token_price_usd: '0.5123' } } }),
      1787342521
    );
    expect(obs.price).toBe(0.5123);
    expect(obs.fetchedAt).toBe(1787342521);
    expect(obs.sourceUrl).toBe(proofUrl(geckoSpec));
  });
  it('reads a DexScreener pair price from either response shape', async () => {
    const fromPairs = await fetchObservation(
      dexSpec,
      async () => ({ pairs: [{ priceUsd: '0.091', liquidity: { usd: 1 }, volume: { h24: 2 } }] }),
      1
    );
    expect(fromPairs.price).toBe(0.091);
    const fromPair = await fetchObservation(
      dexSpec,
      async () => ({ pair: { priceUsd: '0.0902' } }),
      1
    );
    expect(fromPair.price).toBe(0.0902);
  });
  it('throws rather than returning a price it cannot read', async () => {
    await expect(
      fetchObservation(geckoSpec, async () => ({ data: {} }), 1)
    ).rejects.toThrow(/No usable price/);
  });
});

describe('evaluateOutcome', () => {
  it('is strictly above: equality resolves NO', () => {
    const obs = { price: 0.49, sourceUrl: '', fetchedAt: 1, raw: null };
    expect(evaluateOutcome(geckoSpec, obs)).toBe(false);
    expect(evaluateOutcome(geckoSpec, { ...obs, price: 0.4901 })).toBe(true);
    expect(evaluateOutcome(geckoSpec, { ...obs, price: 0.4899 })).toBe(false);
  });
});
