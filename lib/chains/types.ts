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
   * PredictionMarket_V3 - the audited successor. Where this is set,
   * it is the contract new markets and bets go through.
   */
  usdgPool?: `0x${string}`;
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
   * True when this chain's markets can only be read, never written to. Set for
   * Base, whose contracts are all owned by the compromised key: existing
   * positions and results stay visible, but nothing new can be created or bet on.
   */
  readOnly?: boolean;
  stable: StableToken;
}
