/**
 * One observation from a market's declared source, and the comparison that
 * turns it into an outcome. The observation is kept whole because it becomes
 * the resolutionProof: anyone disputing a settlement replays sourceUrl and
 * sees what the resolver saw.
 */

import type { ResolutionSpec } from '@/lib/types/redis';
import type { JsonFetch } from './tokenSelection';

export interface PriceObservation {
  price: number;
  sourceUrl: string;
  fetchedAt: number;
  raw: unknown;
}

export function proofUrl(spec: ResolutionSpec): string {
  return spec.source === 'geckoterminal'
    ? `https://api.geckoterminal.com/api/v2/networks/${spec.network}/pools/${spec.poolAddress}`
    : `https://api.dexscreener.com/latest/dex/pairs/${spec.network}/${spec.poolAddress}`;
}

export async function fetchObservation(
  spec: ResolutionSpec,
  fetchJson: JsonFetch,
  nowUnix: number
): Promise<PriceObservation> {
  const sourceUrl = proofUrl(spec);
  const json = await fetchJson(sourceUrl);

  let price: number;
  let raw: unknown;

  if (spec.source === 'geckoterminal') {
    const attrs = (json as { data?: { attributes?: { base_token_price_usd?: string } } })
      .data?.attributes;
    price = Number(attrs?.base_token_price_usd);
    raw = { base_token_price_usd: attrs?.base_token_price_usd };
  } else {
    const body = json as { pairs?: unknown[]; pair?: unknown };
    const pair = ((body.pairs ?? (body.pair ? [body.pair] : []))[0] ?? null) as {
      priceUsd?: string;
      liquidity?: { usd?: number };
      volume?: { h24?: number };
    } | null;
    price = Number(pair?.priceUsd);
    raw = pair
      ? { priceUsd: pair.priceUsd, liquidityUsd: pair.liquidity?.usd, volumeH24: pair.volume?.h24 }
      : null;
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No usable price at ${sourceUrl}`);
  }
  return { price, sourceUrl, fetchedAt: nowUnix, raw };
}

/** Strictly above wins YES. Equality is not above, so it resolves NO. */
export function evaluateOutcome(
  spec: ResolutionSpec,
  observation: PriceObservation
): boolean {
  return observation.price > spec.threshold;
}
