import { describe, it, expect } from 'vitest';
import {
  parseChartPool,
  geckoTerminalEmbedUrl,
  dexscreenerEmbedUrl,
  tokenChartSources,
} from './tokenChart';

const BTC_GECKO_URL =
  'https://www.geckoterminal.com/eth/pools/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff';

// The shape scripts/create_market.js actually writes for a Robinhood-chain
// token - see docs/superpowers/specs/2026-08-19-market-routine-design.md.
const CASHCAT_DEX_URL =
  'https://dexscreener.com/robinhood/0xA70fc67C9F69da90B63a0e4C05D229954574E313?embed=1&theme=dark&trades=0&info=0';

describe('parseChartPool', () => {
  it('extracts a GeckoTerminal pool', () => {
    expect(parseChartPool(BTC_GECKO_URL)).toEqual({
      provider: 'geckoterminal',
      network: 'eth',
      poolAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    });
  });

  it('extracts a DexScreener pool', () => {
    expect(parseChartPool(CASHCAT_DEX_URL)).toEqual({
      provider: 'dexscreener',
      network: 'robinhood',
      poolAddress: '0xA70fc67C9F69da90B63a0e4C05D229954574E313',
    });
  });

  it('is null for a plain image, not just a missing value', () => {
    expect(parseChartPool('https://i.ibb.co/abc/photo.png')).toBeNull();
    expect(parseChartPool(undefined)).toBeNull();
    expect(parseChartPool(null)).toBeNull();
    expect(parseChartPool('')).toBeNull();
  });
});

describe('tokenChartSources', () => {
  it('offers both providers when the stored chain maps to both', () => {
    const sources = tokenChartSources(BTC_GECKO_URL);
    expect(sources?.geckoterminal).toContain('geckoterminal.com/eth/pools/');
    expect(sources?.dexscreener).toBe(
      'https://dexscreener.com/ethereum/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599?embed=1&theme=dark&trades=0&info=0'
    );
  });

  it('offers only DexScreener for a Robinhood-chain pool, never a guessed GeckoTerminal chain', () => {
    const sources = tokenChartSources(CASHCAT_DEX_URL);
    expect(sources?.dexscreener).toBe(
      'https://dexscreener.com/robinhood/0xA70fc67C9F69da90B63a0e4C05D229954574E313?embed=1&theme=dark&trades=0&info=0'
    );
    expect(sources?.geckoterminal).toBeNull();
  });

  it('is null for a market with no chart at all', () => {
    expect(tokenChartSources('https://i.ibb.co/abc/photo.png')).toBeNull();
    expect(tokenChartSources(undefined)).toBeNull();
  });
});

describe('geckoTerminalEmbedUrl / dexscreenerEmbedUrl', () => {
  it('build embed urls with the flags the app has always used', () => {
    expect(geckoTerminalEmbedUrl('eth', '0x1')).toContain('embed=1');
    expect(dexscreenerEmbedUrl('ethereum', '0x1')).toContain('embed=1');
  });
});
