import { base } from 'viem/chains';
import { createPublicClient, http, type PublicClient } from 'viem';
import { robinhoodChain, robinhoodTestnetChain } from './definitions';
import type { ChainConfig, ChainKey } from './types';

export type { ChainConfig, ChainKey, StableToken, ChainContracts } from './types';
export { robinhoodChain, robinhoodTestnetChain } from './definitions';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

export const CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    key: 'base',
    label: 'Base',
    viemChain: base,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    // Every Base contract is owned by 0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd,
    // whose key was compromised and cannot be recovered. PredictionMarketV2 has
    // no transferOwnership at all, so its markets can never be resolved again.
    // History stays readable; nothing new is written here.
    readOnly: true,
    contracts: {
      v2: (process.env.NEXT_PUBLIC_CONTRACT_V2_ADDRESS
        || '0x2bA339Df34B98099a9047d9442075F7B3a792f74') as `0x${string}`,
      dualPool: (process.env.NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT
        || '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205') as `0x${string}`,
      swipeClaim: (process.env.NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT || ZERO) as `0x${string}`,
    },
    stable: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
    },
  },

  robinhoodTestnet: {
    key: 'robinhoodTestnet',
    label: 'Robinhood Testnet',
    viemChain: robinhoodTestnetChain,
    rpcUrl: process.env.ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    contracts: {
      // No $SWIPE on Robinhood, so there is no v2 leg by design.
      dualPool: (process.env.ROBINHOOD_TESTNET_DUALPOOL || ZERO) as `0x${string}`,
      // Audited successor, owned by the current key.
      usdgPool: (process.env.ROBINHOOD_TESTNET_USDG_DUALPOOL || ZERO) as `0x${string}`,
    },
    stable: {
      // Testnet has no USDG; MockUSDC stands in for it.
      address: (process.env.ROBINHOOD_TESTNET_MOCK_USDC || ZERO) as `0x${string}`,
      symbol: 'mUSDC',
      decimals: 6,
    },
  },

  robinhood: {
    key: 'robinhood',
    label: 'Robinhood',
    viemChain: robinhoodChain,
    rpcUrl: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    contracts: {
      usdgPool: (process.env.ROBINHOOD_USDG_DUALPOOL || ZERO) as `0x${string}`,
    },
    stable: {
      // Paxos USDG. Verified on-chain: symbol() == "USDG", decimals() == 6.
      // Searching this chain's explorer for "USDC" returns 18-decimal impostors
      // with no liquidity - never substitute a looked-up address here.
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      symbol: 'USDG',
      decimals: 6,
    },
  },
};

export const DEFAULT_CHAIN_KEY: ChainKey = 'base';

export function getChainConfig(key: ChainKey = DEFAULT_CHAIN_KEY): ChainConfig {
  const config = CHAINS[key];
  if (!config) throw new Error(`Unknown chain: ${key}`);
  return config;
}

/**
 * Single construction point for server-side read clients. Replaces the
 * createPublicClient({ chain: base, transport: http(env || 'https://mainnet.base.org') })
 * block that was duplicated across 18 API routes.
 */
export function createChainPublicClient(key: ChainKey = DEFAULT_CHAIN_KEY): PublicClient {
  const { viemChain, rpcUrl } = getChainConfig(key);
  return createPublicClient({ chain: viemChain, transport: http(rpcUrl) }) as PublicClient;
}

/** True when a chain's markets are history only and accept no new writes. */
export function isReadOnlyChain(key: ChainKey = DEFAULT_CHAIN_KEY): boolean {
  return getChainConfig(key).readOnly === true;
}

/**
 * The market contract new bets should go to, or null when the chain is
 * read-only. Callers that write must check this rather than reaching for
 * `contracts.dualPool`, which on Base points at a contract nobody controls.
 */
export function getWritableMarket(
  key: ChainKey = DEFAULT_CHAIN_KEY
): `0x${string}` | null {
  const config = getChainConfig(key);
  if (config.readOnly) return null;
  const pool = config.contracts.usdgPool;
  if (!pool || pool === ZERO) return null;
  return pool;
}
