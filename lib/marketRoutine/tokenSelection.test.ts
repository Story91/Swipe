import { describe, it, expect } from 'vitest';
import {
  filterAndRank,
  selectBaseTokens,
  selectRobinhoodTokens,
  type PoolCandidate,
  type JsonFetch,
} from './tokenSelection';

function candidate(over: Partial<PoolCandidate>): PoolCandidate {
  return {
    symbol: 'AERO',
    poolAddress: '0xpool',
    priceUsd: 0.47,
    liquidityUsd: 1_000_000,
    volume24hUsd: 500_000,
    change24hPct: 4,
    ...over,
  };
}

describe('filterAndRank', () => {
  it('drops denylisted symbols case-insensitively', () => {
    expect(filterAndRank([candidate({ symbol: 'usdc' })])).toEqual([]);
    expect(filterAndRank([candidate({ symbol: 'WETH' })])).toEqual([]);
  });
  it('drops anything priced within 2 percent of one dollar', () => {
    expect(filterAndRank([candidate({ symbol: 'FAKESTABLE', priceUsd: 1.015 })])).toEqual([]);
    expect(filterAndRank([candidate({ symbol: 'VIRTUAL', priceUsd: 1.08 })])).toHaveLength(1);
  });
  it('enforces the liquidity and volume floors', () => {
    expect(filterAndRank([candidate({ liquidityUsd: 49_000 })])).toEqual([]);
    expect(filterAndRank([candidate({ volume24hUsd: 9_000 })])).toEqual([]);
  });
  it('keeps one pool per symbol, the deepest', () => {
    const shallow = candidate({ poolAddress: '0xa', liquidityUsd: 60_000 });
    const deep = candidate({ poolAddress: '0xb', liquidityUsd: 900_000 });
    const out = filterAndRank([shallow, deep]);
    expect(out).toHaveLength(1);
    expect(out[0].poolAddress).toBe('0xb');
  });
  it('ranks by 24h volume and cuts at max', () => {
    const pools = ['A', 'B', 'C'].map((s, i) =>
      candidate({ symbol: s, poolAddress: `0x${s}`, volume24hUsd: (i + 1) * 100_000 })
    );
    const out = filterAndRank(pools, 2);
    expect(out.map((p) => p.symbol)).toEqual(['C', 'B']);
  });
});

describe('selectBaseTokens', () => {
  it('parses trending pools and builds GeckoTerminal chart urls', async () => {
    const fetchJson: JsonFetch = async () => ({
      data: [
        {
          attributes: {
            name: 'AERO / USDC 0.3%',
            address: '0xaeropool',
            base_token_price_usd: '0.47',
            reserve_in_usd: '900000',
            volume_usd: { h24: '400000' },
            price_change_percentage: { h24: '-4.2' },
          },
        },
        {
          attributes: {
            name: 'USDC / WETH',
            address: '0xstablepool',
            base_token_price_usd: '0.9999',
            reserve_in_usd: '5000000',
            volume_usd: { h24: '9000000' },
            price_change_percentage: { h24: '0.01' },
          },
        },
      ],
    });
    const out = await selectBaseTokens(fetchJson);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'AERO',
      network: 'base',
      source: 'geckoterminal',
      poolAddress: '0xaeropool',
      priceUsd: 0.47,
      change24hPct: -4.2,
    });
    expect(out[0].chartUrl).toBe(
      'https://www.geckoterminal.com/base/pools/0xaeropool?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff'
    );
  });
});

describe('selectRobinhoodTokens', () => {
  it('takes the deepest robinhood pair per candidate and ranks by volume', async () => {
    const fetchJson: JsonFetch = async (url) => {
      if (url.includes('q=CASHCAT')) {
        return {
          pairs: [
            {
              chainId: 'robinhood',
              pairAddress: '0xdeep',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 1_400_000 },
              volume: { h24: 7_000_000 },
              priceChange: { h24: 12 },
            },
            {
              chainId: 'robinhood',
              pairAddress: '0xshallow',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 60_000 },
              volume: { h24: 100_000 },
              priceChange: { h24: 12 },
            },
            {
              chainId: 'solana',
              pairAddress: 'notours',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 9_000_000 },
              volume: { h24: 1 },
            },
          ],
        };
      }
      return { pairs: [] };
    };
    const out = await selectRobinhoodTokens(fetchJson, ['CASHCAT', 'BRODIE']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'CASHCAT',
      network: 'robinhood',
      source: 'dexscreener',
      poolAddress: '0xdeep',
    });
    expect(out[0].chartUrl).toBe(
      'https://dexscreener.com/robinhood/0xdeep?embed=1&theme=dark&trades=0&info=0'
    );
  });
});
