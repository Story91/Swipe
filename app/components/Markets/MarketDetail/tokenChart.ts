/**
 * Live token-price chart sources for a crypto market.
 *
 * The market's own chart (OddsChart) plots YES/NO probability, not the
 * underlying token's price. The pool a market tracks has no field of its own
 * on the prediction record - it is baked into `imageUrl`, the embed URL the
 * create flow wrote at proposal time. Two different embed URLs get stored
 * there today, not one:
 *
 *  - GeckoTerminal, `.../{chain}/pools/{address}?embed=1...`, from
 *    CreatePredictionModal.tsx's hardcoded CRYPTO_OPTIONS (BTC/ETH/SOL/XRP/
 *    BNB/SWIPE, all on chains GeckoTerminal indexes).
 *  - DexScreener, `.../{chain}/{pairAddress}?embed=1...`, from markets made
 *    with `scripts/create_market.js` for Robinhood-chain tokens (CASHCAT,
 *    BRODIE, HOODRAT, ...). GeckoTerminal does not index Robinhood Chain at
 *    all (see docs/superpowers/specs/2026-08-19-market-routine-design.md),
 *    so these were never going to be GeckoTerminal URLs.
 *
 * Parsing whichever is stored, rather than assuming GeckoTerminal, is what
 * lets this page offer the other provider for the same pool without a new
 * field - and, just as importantly, what stops it from offering
 * GeckoTerminal for a chain GeckoTerminal cannot show.
 *
 * No React and no CSS import, same reason as marketDetail.ts.
 */

export type TokenChartProvider = 'geckoterminal' | 'dexscreener';

export interface ChartPool {
  /** Which provider's URL was actually stored. */
  provider: TokenChartProvider;
  /** That provider's own network slug, as stored - not normalised. */
  network: string;
  poolAddress: string;
}

/** Extracts {provider, network, pool} from a stored chart embed URL. Null for a plain image. */
export function parseChartPool(imageUrl: string | undefined | null): ChartPool | null {
  if (!imageUrl) return null;

  const gecko = imageUrl.match(/geckoterminal\.com\/([a-z0-9_-]+)\/pools\/([^/?#]+)/i);
  if (gecko) return { provider: 'geckoterminal', network: gecko[1].toLowerCase(), poolAddress: gecko[2] };

  const dex = imageUrl.match(/dexscreener\.com\/([a-z0-9_-]+)\/([^/?#]+)/i);
  if (dex) return { provider: 'dexscreener', network: dex[1].toLowerCase(), poolAddress: dex[2] };

  return null;
}

/**
 * GeckoTerminal and DexScreener do not share one chain-naming scheme
 * (GeckoTerminal's Ethereum is 'eth', DexScreener's is 'ethereum'), and
 * neither has a public endpoint to resolve one from the other. Limited to
 * chains this app actually mints markets on today (CreatePredictionModal's
 * CRYPTO_OPTIONS, plus Base and Robinhood) and a handful of other
 * GeckoTerminal slugs common enough to be worth covering.
 *
 * Robinhood Chain is deliberately absent: GeckoTerminal does not index it, so
 * a Robinhood-native token has no GeckoTerminal side to offer, and guessing
 * one would render either nothing or someone else's pool.
 */
const GECKO_TO_DEXSCREENER_CHAIN: Record<string, string> = {
  eth: 'ethereum',
  bsc: 'bsc',
  base: 'base',
  solana: 'solana',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  polygon_pos: 'polygon',
  avax: 'avalanche',
};

const DEXSCREENER_TO_GECKO_CHAIN: Record<string, string> = Object.fromEntries(
  Object.entries(GECKO_TO_DEXSCREENER_CHAIN).map(([gecko, dex]) => [dex, gecko])
);

export function geckoTerminalEmbedUrl(network: string, poolAddress: string): string {
  return `https://www.geckoterminal.com/${network}/pools/${poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d`;
}

export function dexscreenerEmbedUrl(network: string, poolAddress: string): string {
  return `https://dexscreener.com/${network}/${poolAddress}?embed=1&theme=dark&trades=0&info=0`;
}

export interface TokenChartSources {
  geckoterminal: string | null;
  dexscreener: string | null;
}

/**
 * The embeds available for one market, or null when it has no parseable
 * pool. Always includes the provider the URL was actually stored for; the
 * other provider is filled in only when its equivalent chain slug is known.
 */
export function tokenChartSources(imageUrl: string | undefined | null): TokenChartSources | null {
  const pool = parseChartPool(imageUrl);
  if (!pool) return null;

  if (pool.provider === 'geckoterminal') {
    const dexNetwork = GECKO_TO_DEXSCREENER_CHAIN[pool.network];
    return {
      geckoterminal: geckoTerminalEmbedUrl(pool.network, pool.poolAddress),
      dexscreener: dexNetwork ? dexscreenerEmbedUrl(dexNetwork, pool.poolAddress) : null,
    };
  }

  const geckoNetwork = DEXSCREENER_TO_GECKO_CHAIN[pool.network];
  return {
    geckoterminal: geckoNetwork ? geckoTerminalEmbedUrl(geckoNetwork, pool.poolAddress) : null,
    dexscreener: dexscreenerEmbedUrl(pool.network, pool.poolAddress),
  };
}
