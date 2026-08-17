import { createChainPublicClient } from './index';
import { getMarketContract } from './market';
import type { ChainKey } from './types';

/**
 * The fee rates a payout has to use, read from the contract and cached.
 *
 * Server-side payout figures were computed with no fee at all, so every profit
 * on the portfolio, the leaderboard and the activity feed was overstated by
 * whatever the losing pool's cut is. Writing the rate down instead is not a fix:
 * the contract's constructor default is 100 bps and the deploy script sets 300
 * afterwards, so the literal that looks obvious is the wrong one, and the owner
 * can move both rates after deploy.
 *
 * Cached per chain because it is the same answer for every market and every
 * user, and a listing computes payouts for hundreds of rows in one request. Five
 * minutes is short enough that a rate change shows up quickly and long enough
 * that a page load is one call rather than hundreds.
 *
 * On a failure the launch rates are returned rather than zero. Zero would be a
 * silent overstatement of every figure on the page, which is the bug this file
 * exists to remove; the launch rates are wrong only if someone has changed them,
 * and then only until the next successful read.
 */

export interface FeeBps {
  platform: number;
  creator: number;
  exit: number;
  /** Raw minimum bet, in the collateral's own decimals. */
  minBet: bigint;
  /** False when this is the fallback rather than a reading. */
  live: boolean;
}

/** What scripts/deploy_v3.js sets after deployment, measured on both chains. */
const LAUNCH_RATES: FeeBps = {
  platform: 300,
  creator: 50,
  exit: 500,
  minBet: BigInt(100000),
  live: false,
};

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<ChainKey, { at: number; value: FeeBps }>();

export async function getFeeBps(chain: ChainKey): Promise<FeeBps> {
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const market = getMarketContract(chain);
  if (!market) return LAUNCH_RATES;

  try {
    const config = (await createChainPublicClient(chain).readContract({
      address: market.address,
      abi: market.abi as never,
      functionName: 'getFeeConfig',
    })) as readonly bigint[];

    const value: FeeBps = {
      platform: Number(config[0]),
      creator: Number(config[1]),
      exit: Number(config[2]),
      minBet: config[3],
      live: true,
    };
    cache.set(chain, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error(`[fees] could not read getFeeConfig on ${chain}:`, error);
    return LAUNCH_RATES;
  }
}
