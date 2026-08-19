/**
 * Which tokens get a market this week.
 *
 * Base asks GeckoTerminal's trending list. Robinhood Chain is not indexed by
 * GeckoTerminal, and DexScreener has no public per-chain ranking, so its side
 * ranks a curated candidate list by live volume instead. Both funnel through
 * one filter: no stables, no wrapped majors, real liquidity, real volume.
 *
 * The selected pool is deliberately the same pool the card's chart embeds and
 * the same pool the resolver reads: what people watch is what settles.
 */

export type JsonFetch = (url: string) => Promise<unknown>;

export interface SelectedToken {
  symbol: string;
  poolAddress: string;
  network: 'base' | 'robinhood';
  source: 'geckoterminal' | 'dexscreener';
  priceUsd: number;
  change24hPct: number;
  chartUrl: string;
}

export interface PoolCandidate {
  symbol: string;
  poolAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  change24hPct: number;
}

/** Symbols that are money or a wrapper around money, not a market. */
export const STABLE_WRAPPED_DENYLIST = [
  'USDC', 'USDBC', 'USDT', 'USDS', 'SUSDS', 'USDE', 'USDG', 'DAI', 'FRAX',
  'GHO', 'SYRUPUSDC', 'WETH', 'ETH', 'WBTC', 'CBBTC', 'CBETH', 'WEETH',
  'WSTETH', 'RETH', 'AWETH', 'CLBTC',
];

const MIN_LIQUIDITY_USD = 50_000;
const MIN_VOLUME_24H_USD = 10_000;

/**
 * Robinhood Chain natives worth considering, ranked live each week. Adding a
 * token is a one-line edit here. Replace this list with trending once
 * GeckoTerminal indexes the chain.
 */
export const ROBINHOOD_CANDIDATES = [
  'CASHCAT', 'BRODIE', 'HOODRAT', 'ARROW', 'DIH', 'DOGINHOOD', 'STONK',
  'PIGGY',
];

export function filterAndRank(
  candidates: PoolCandidate[],
  max = 5
): PoolCandidate[] {
  const deny = new Set(STABLE_WRAPPED_DENYLIST);
  const kept = candidates.filter(
    (c) =>
      !deny.has(c.symbol.toUpperCase()) &&
      Number.isFinite(c.priceUsd) &&
      c.priceUsd > 0 &&
      Math.abs(c.priceUsd - 1) > 0.02 &&
      c.liquidityUsd > MIN_LIQUIDITY_USD &&
      c.volume24hUsd > MIN_VOLUME_24H_USD
  );

  const bySymbol = new Map<string, PoolCandidate>();
  for (const c of kept) {
    const key = c.symbol.toUpperCase();
    const prev = bySymbol.get(key);
    if (!prev || c.liquidityUsd > prev.liquidityUsd) bySymbol.set(key, c);
  }

  return [...bySymbol.values()]
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
    .slice(0, max);
}

interface GtPool {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    reserve_in_usd?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
  };
}

export async function selectBaseTokens(
  fetchJson: JsonFetch,
  max = 5
): Promise<SelectedToken[]> {
  const json = (await fetchJson(
    'https://api.geckoterminal.com/api/v2/networks/base/trending_pools'
  )) as { data?: GtPool[] };

  const candidates: PoolCandidate[] = (json.data ?? []).flatMap((p) => {
    const a = p.attributes ?? {};
    const symbol = (a.name ?? '').split('/')[0].trim();
    const priceUsd = Number(a.base_token_price_usd);
    if (!symbol || !a.address || !Number.isFinite(priceUsd)) return [];
    return [
      {
        symbol,
        poolAddress: a.address,
        priceUsd,
        liquidityUsd: Number(a.reserve_in_usd ?? 0),
        volume24hUsd: Number(a.volume_usd?.h24 ?? 0),
        change24hPct: Number(a.price_change_percentage?.h24 ?? 0),
      },
    ];
  });

  return filterAndRank(candidates, max).map((c) => ({
    symbol: c.symbol,
    poolAddress: c.poolAddress,
    network: 'base' as const,
    source: 'geckoterminal' as const,
    priceUsd: c.priceUsd,
    change24hPct: c.change24hPct,
    chartUrl:
      `https://www.geckoterminal.com/base/pools/${c.poolAddress}` +
      '?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff',
  }));
}

interface DsPair {
  chainId?: string;
  pairAddress?: string;
  priceUsd?: string;
  baseToken?: { symbol?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
}

export async function selectRobinhoodTokens(
  fetchJson: JsonFetch,
  candidates: string[] = ROBINHOOD_CANDIDATES,
  max = 5
): Promise<SelectedToken[]> {
  const pools: PoolCandidate[] = [];

  for (const symbol of candidates) {
    const json = (await fetchJson(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`
    )) as { pairs?: DsPair[] };

    const best = (json.pairs ?? [])
      .filter(
        (p) =>
          p.chainId === 'robinhood' &&
          p.pairAddress &&
          (p.baseToken?.symbol ?? '').toUpperCase() === symbol.toUpperCase() &&
          Number.isFinite(Number(p.priceUsd))
      )
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    if (!best) continue;
    pools.push({
      symbol: symbol.toUpperCase(),
      poolAddress: best.pairAddress as string,
      priceUsd: Number(best.priceUsd),
      liquidityUsd: best.liquidity?.usd ?? 0,
      volume24hUsd: best.volume?.h24 ?? 0,
      change24hPct: best.priceChange?.h24 ?? 0,
    });
  }

  return filterAndRank(pools, max).map((c) => ({
    symbol: c.symbol,
    poolAddress: c.poolAddress,
    network: 'robinhood' as const,
    source: 'dexscreener' as const,
    priceUsd: c.priceUsd,
    change24hPct: c.change24hPct,
    chartUrl: `https://dexscreener.com/robinhood/${c.poolAddress}?embed=1&theme=dark&trades=0&info=0`,
  }));
}
