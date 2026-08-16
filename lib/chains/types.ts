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
  /** PredictionMarket_USDC_DualPool - stablecoin pools. */
  dualPool?: `0x${string}`;
  swipeClaim?: `0x${string}`;
}

export interface ChainConfig {
  key: ChainKey;
  label: string;
  viemChain: Chain;
  rpcUrl: string;
  explorer: string;
  contracts: ChainContracts;
  stable: StableToken;
}
