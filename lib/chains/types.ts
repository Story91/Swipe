import type { Chain } from 'viem';

export type ChainKey = 'base' | 'robinhoodTestnet' | 'robinhood';

export interface StableToken {
  address: `0x${string}`;
  symbol: string;
  /** USDC and USDG are both 6-decimal; the pool payout math assumes it. */
  decimals: number;
}

export interface ChainContracts {
  /** PredictionMarketV2 - ETH + SWIPE pools. Absent on chains without $SWIPE. */
  v2?: `0x${string}`;
  /**
   * PredictionMarket_USDC_DualPool - the original stablecoin market.
   * Its owner key is compromised and unrecoverable, so on Base this is
   * read-only history: no new markets, no new bets.
   */
  dualPool?: `0x${string}`;
  /**
   * PredictionMarket_V3, the audited successor and the only contract new
   * markets and bets go through. Named for what it is rather than for its
   * collateral: it holds USDC on Base and USDG on Robinhood, and the earlier
   * name `usdgPool` read as Robinhood-only once V3 shipped on Base first.
   *
   * Absent means the chain has no live market, which is the whole of what
   * makes a chain unwritable. See getWritableMarket.
   */
  market?: `0x${string}`;
  swipeClaim?: `0x${string}`;
}

export interface ChainConfig {
  key: ChainKey;
  label: string;
  viemChain: Chain;
  rpcUrl: string;
  explorer: string;
  contracts: ChainContracts;
  /**
   * True when this chain carries markets on contracts nobody controls any more.
   * Base does: its V1, V2 and USDC pools are owned by a compromised key, so
   * those markets can never be resolved or claimed again.
   *
   * This is a statement about old markets, not about the chain. Base runs V3
   * now, so it accepts new bets while its old markets stay frozen. Whether a
   * chain accepts writes is answered by `contracts.market` and nothing else,
   * which is why this replaced the old `readOnly` flag: one boolean could not
   * describe a chain with one live contract and three dead ones, and every
   * write guard that leaned on it would have opened onto a dead address the
   * moment Base went live again.
   */
  archivedMarkets?: boolean;
  stable: StableToken;
}
