import { base } from 'viem/chains';
import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
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
    // The v2, dualPool and V1 contracts below are archived: their owner key
    // is no longer available, and PredictionMarketV2 has no transferOwnership
    // at all, so those markets can never be resolved again. They stay
    // readable and nothing new is ever written to them.
    archivedMarkets: true,
    contracts: {
      v2: (process.env.NEXT_PUBLIC_CONTRACT_V2_ADDRESS
        || '0x2bA339Df34B98099a9047d9442075F7B3a792f74') as `0x${string}`,
      dualPool: (process.env.NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT
        || '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205') as `0x${string}`,
      // PredictionMarket_V3, deployed and verified on Base mainnet 2026-08-17,
      // collateralised in the USDC below. Owned by a fresh operational key,
      // unrelated to the archived contracts above.
      //
      // Literal fallback on purpose, and NEXT_PUBLIC_ on purpose: this address
      // has to be readable in the browser or the UI silently sees the zero
      // address while the server sees the real one. That is safe here only
      // because isWritableMarket compares the address a caller is about to
      // write to; a reachable address is not on its own permission to write.
      market: (process.env.NEXT_PUBLIC_BASE_V3_CONTRACT
        || '0x5C4078BB24f352809B93FF395cA7655835D1CA4a') as `0x${string}`,
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
    // These addresses are read from env vars with no NEXT_PUBLIC_ prefix, so
    // Next.js leaves them undefined in the browser bundle: on the server this
    // chain has its real pool address, in the UI it has the zero address, and
    // getWritableMarket answers the same question two different ways depending
    // on where it runs. Verified against a production build — the value of
    // ROBINHOOD_TESTNET_USDG_DUALPOOL, which .env.local does set, appears in no
    // client chunk, while NEXT_PUBLIC_CONTRACT_V2_ADDRESS's value appears in
    // three.
    //
    // Prefixing them is what makes a Robinhood market reachable from the UI at
    // all, and it is therefore the moment every client-side write guard has to
    // already be sound — see isWritableMarket.
    contracts: {
      // No $SWIPE on Robinhood, so there is no v2 leg by design.
      dualPool: (process.env.ROBINHOOD_TESTNET_DUALPOOL || ZERO) as `0x${string}`,
      // V3's audited predecessor, owned by the current key. Not V3 itself: the
      // deployed code here has no weightBpsAt, so it has no time weighting.
      market: (process.env.ROBINHOOD_TESTNET_USDG_DUALPOOL || ZERO) as `0x${string}`,
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
      // PredictionMarket_V3, deployed and configured on Robinhood mainnet
      // 2026-08-17, collateralised in the USDG below. Same owner and first
      // resolver as Base.
      //
      // NEXT_PUBLIC_ and a literal fallback, matching Base's form above. This
      // is the line that makes the address reachable from the browser at all:
      // without the prefix Next.js leaves it undefined there, so the UI reads
      // the zero address, getWritableMarket returns null and every write guard
      // refuses while the server insists the market exists.
      //
      // It is only safe because the guards do not trust reachability. Every
      // market write goes through useMarketWrite, which compares the address it
      // is about to write to against this chain's market at send time, moves
      // the wallet onto the matching chain and pins chainId.
      market: (process.env.NEXT_PUBLIC_ROBINHOOD_V3_CONTRACT
        || '0x1AD8DD99C31EA51c1bCE99fB10d609485937C7DA') as `0x${string}`,
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

/**
 * Every chain config the app can use, default first.
 *
 * Testnets are included only behind NEXT_PUBLIC_SHOW_TESTNETS, matching what
 * the network switcher offers — registering a chain the user can never select
 * would just add a transport nobody uses.
 */
export function chainList(): ChainConfig[] {
  const showTestnets = process.env.NEXT_PUBLIC_SHOW_TESTNETS === 'true';
  const keys = (Object.keys(CHAINS) as ChainKey[]).filter(
    (key) => showTestnets || !CHAINS[key].viemChain.testnet
  );
  // Default first: wagmi connects on chains[0].
  keys.sort((a, b) => (a === DEFAULT_CHAIN_KEY ? -1 : b === DEFAULT_CHAIN_KEY ? 1 : 0));
  return keys.map((key) => CHAINS[key]);
}

/** viem Chain objects for createConfig, in the same order as chainList(). */
export function supportedChains(): [Chain, ...Chain[]] {
  const chains = chainList().map((c) => c.viemChain);
  return chains as [Chain, ...Chain[]];
}

/**
 * True when a chain has no live market, so nothing new can be bet or created on
 * it. Derived, not declared: a chain is unwritable exactly when it has no market
 * address, and there is no separate flag that can disagree with that.
 *
 * This is not the same question as "does this chain hold archived markets".
 * Base holds three dead contracts and one live one, so it answers false here and
 * true to `hasArchivedMarkets`. Use this for write paths and that one for copy
 * about old markets.
 */
export function isReadOnlyChain(key: ChainKey = DEFAULT_CHAIN_KEY): boolean {
  return getWritableMarket(key) === null;
}

/**
 * True when a chain carries markets on contracts nobody controls any more, whose
 * positions can never be resolved or claimed. Drives copy, never permissions.
 */
export function hasArchivedMarkets(key: ChainKey = DEFAULT_CHAIN_KEY): boolean {
  return getChainConfig(key).archivedMarkets === true;
}

/**
 * The market contract new bets should go to, or null when the chain has none.
 * Callers that write must check this rather than reaching for
 * `contracts.dualPool`, which on Base points at a contract nobody controls.
 *
 * This answers "does this chain have a market?", which is *not* the question a
 * caller about to send a transaction needs answered. If you are about to write
 * to an address, use `isWritableMarket` and pass that address.
 */
export function getWritableMarket(
  key: ChainKey = DEFAULT_CHAIN_KEY
): `0x${string}` | null {
  const market = getChainConfig(key).contracts.market;
  if (!market || market === ZERO) return null;
  return market;
}

/**
 * True only when `target` is exactly the market contract that writes on `key`
 * must go to.
 *
 * The write guard has two halves and `getWritableMarket` is only the first. A
 * caller that checks the chain and then writes to an address of its own — a
 * module-scope constant, say — has verified nothing about where the money
 * goes: the moment that chain's pool address becomes configured, the chain
 * check starts passing while the transaction still leaves for whatever address
 * was hardcoded. On a chain where that address holds no contract, a transfer
 * to it is simply gone.
 *
 * So the guard compares the address. Anything that is not this chain's market
 * is refused, and wiring a new chain up means routing its address (and ABI)
 * through here — not setting an env var and hoping the call sites followed.
 */
export function isWritableMarket(
  key: ChainKey,
  target: string | null | undefined
): boolean {
  const market = getWritableMarket(key);
  if (!market || !target) return false;
  return target.toLowerCase() === market.toLowerCase();
}
