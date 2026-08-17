import { erc20Abi, formatUnits, type PublicClient } from 'viem';
import { CHAINS, createChainPublicClient } from './index';
import type { ChainKey } from './types';
import { selectableChains } from './activeChain';
import { getMarketContract, type MarketContract } from './market';

/**
 * What the market chooser knows about a chain, and how it finds out.
 *
 * The old switcher described a chain from constants: a label, a dot and a tag
 * that came from lib/chains and nothing else. That is fine until the two
 * deployments differ, and they can. Fees are settable on V3 after deploy, the
 * launch rates are applied by scripts/deploy_v3.js rather than the constructor,
 * and minBet is denominated in a collateral the contract itself names. A card
 * that recites the config would keep saying 3% after somebody calls
 * setPlatformFee, and nobody would find out from the UI.
 *
 * So every number on a card is read from that chain's contract at open time.
 * The only things taken from config are the chain's name and which address to
 * ask, which is exactly what config is for.
 */

/**
 * Canonical Multicall3. Same address on every chain that carries it, which is
 * why it can be a constant rather than per-chain configuration.
 *
 * Passed explicitly because lib/chains/definitions.ts declares no contracts for
 * the Robinhood chains and viem refuses a multicall when the chain config has
 * no address. Verified live on 2026-08-17: eth_getCode at this address returns
 * 7618 bytes on Robinhood mainnet, and viem's own `base` definition carries the
 * same address.
 */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * How far up the id space the market count probes.
 *
 * V3 has no counter. Ids are handed out by one Redis INCR shared by both
 * chains (scripts/create_market.js, lib/marketAllocator.ts), starting at 1 and
 * never reused, so a chain's markets are scattered through a single sequence
 * rather than numbered from one. Counting therefore means asking
 * `predictions(id).registered` across that sequence, in one multicall.
 *
 * Events would be the obvious alternative and are not available: eth_getLogs
 * from block 0 against the public Base RPC fails outright, so a count built on
 * logs would show nothing on the chain that has the markets.
 *
 * 64 covers the allocator today with room to spare. Past it the count is
 * reported as a floor rather than silently truncated, see `countIsFloor`.
 */
export const MARKET_PROBE_LIMIT = 64;

export interface ChainOptionBase {
  key: ChainKey;
  label: string;
  testnet: boolean;
}

export interface AvailableChainOption extends ChainOptionBase {
  selectable: true;
  market: MarketContract;
}

export interface UnavailableChainOption extends ChainOptionBase {
  selectable: false;
  /** Shown on the card. A chain nobody can pick still has to say why. */
  reason: string;
}

export type ChainOption = AvailableChainOption | UnavailableChainOption;

/**
 * The chains the chooser offers, in config order, testnets last and only when
 * they are switched on.
 *
 * A chain with no market deployed is included and marked unselectable rather
 * than dropped. People still hold positions on chains that stop taking bets,
 * and a network that vanishes from the list looks like the app lost it.
 */
export function chainOptions(showTestnets: boolean): ChainOption[] {
  return selectableChains(showTestnets).map((key) => {
    const config = CHAINS[key];
    const base: ChainOptionBase = {
      key,
      label: config.label,
      testnet: config.viemChain.testnet === true,
    };
    const market = getMarketContract(key);
    if (!market) {
      return {
        ...base,
        selectable: false,
        reason: 'No Swipe market is deployed here, so this network takes no bets.',
      };
    }
    return { ...base, selectable: true, market };
  });
}

export type SelectionResult = 'selected' | 'unchanged' | 'declined' | 'unavailable';

/**
 * Point the app at a chain.
 *
 * The order is the whole point and it has not changed from the dropdown this
 * replaces: move the wallet, wait for it, then record the choice. Written the
 * other way round the app's idea of the current chain and the wallet's can
 * disagree indefinitely, because a read with no explicit chainId runs on the
 * wallet's chain while the labels and addresses follow the stored preference.
 *
 * A declined switch records nothing and returns 'declined'. That is the honest
 * outcome: the user said no, so the selection did not happen.
 *
 * This is convenience, not protection. useMarketWrite resolves the contract,
 * compares the address it is about to write to and pins chainId at send time,
 * whatever this function did or did not manage to do.
 */
export async function selectChain(params: {
  option: ChainOption;
  current: ChainKey;
  isConnected: boolean;
  switchChain: (args: { chainId: number }) => Promise<unknown>;
  setChain: (key: ChainKey) => void;
}): Promise<SelectionResult> {
  const { option, current, isConnected, switchChain, setChain } = params;

  // A chain with no market is not a choice. Checked here rather than only in
  // the markup, so a card that renders as disabled and a card that cannot be
  // selected are the same fact rather than two that can drift.
  if (!option.selectable) return 'unavailable';
  if (option.key === current) return 'unchanged';

  if (isConnected) {
    try {
      await switchChain({ chainId: option.market.chainId });
    } catch {
      return 'declined';
    }
  }

  setChain(option.key);
  return 'selected';
}

export interface ChainStats {
  /** Basis points, straight from getFeeConfig(). 300 is 3%. */
  fees: { platformBps: number; creatorBps: number; earlyExitBps: number };
  /** Smallest bet the contract accepts, in collateral units. */
  minBet: bigint;
  /** The token this deployment holds, named by the deployment itself. */
  collateral: { address: `0x${string}`; symbol: string; decimals: number };
  /** Null when the probe failed. Zero is a real answer and means zero. */
  marketCount: number | null;
  /** True when the probe window filled up, so the count is "at least". */
  countIsFloor: boolean;
  /** Null with no wallet connected, and null when the read failed. */
  balance: bigint | null;
}

/**
 * Read one chain's card.
 *
 * `client` and `probeLimit` exist for tests. In the app the client comes from
 * createChainPublicClient, which is the single construction point for read
 * clients and carries that chain's configured RPC.
 *
 * Throws when the chain has no market. Callers get that answer from
 * chainOptions first and never reach here for an unselectable chain.
 *
 * Fees, collateral and its decimals are load-bearing: a card that cannot read
 * them has nothing to show, so a failure propagates and the card renders its
 * error. The count and the balance are not, so each fails to null on its own
 * and the rest of the card still renders.
 */
export async function readChainStats(
  key: ChainKey,
  opts: {
    account?: `0x${string}` | null;
    client?: PublicClient;
    probeLimit?: number;
  } = {}
): Promise<ChainStats> {
  const market = getMarketContract(key);
  if (!market) throw new Error(`${CHAINS[key].label} has no market contract.`);

  const client = opts.client ?? createChainPublicClient(key);
  const probeLimit = opts.probeLimit ?? MARKET_PROBE_LIMIT;

  const [feeConfig, collateralAddress] = await Promise.all([
    client.readContract({
      address: market.address,
      abi: market.abi,
      functionName: 'getFeeConfig',
      args: [],
    }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
    // Asked of the market rather than taken from lib/chains. The contract's
    // collateral is immutable and set at deploy time, so this is the only
    // reading that cannot be wrong, and USDC and USDG share 6 decimals, which
    // means a mixed-up address formats perfectly and pays nobody.
    client.readContract({
      address: market.address,
      abi: market.abi,
      functionName: 'collateral',
      args: [],
    }) as Promise<`0x${string}`>,
  ]);

  const [symbol, decimals] = await Promise.all([
    client.readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: 'symbol',
    }),
    client.readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  ]);

  const [count, balance] = await Promise.all([
    countRegisteredMarkets(client, market, probeLimit),
    readBalance(client, collateralAddress, opts.account),
  ]);

  return {
    fees: {
      platformBps: Number(feeConfig[0]),
      creatorBps: Number(feeConfig[1]),
      earlyExitBps: Number(feeConfig[2]),
    },
    minBet: feeConfig[3],
    collateral: { address: collateralAddress, symbol: String(symbol), decimals: Number(decimals) },
    marketCount: count.value,
    countIsFloor: count.isFloor,
    balance,
  };
}

async function readBalance(
  client: PublicClient,
  token: `0x${string}`,
  account: `0x${string}` | null | undefined
): Promise<bigint | null> {
  if (!account) return null;
  try {
    return (await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    })) as bigint;
  } catch {
    return null;
  }
}

async function countRegisteredMarkets(
  client: PublicClient,
  market: MarketContract,
  limit: number
): Promise<{ value: number | null; isFloor: boolean }> {
  const ids = Array.from({ length: limit }, (_, i) => BigInt(i + 1));
  try {
    const results = await client.multicall({
      contracts: ids.map((id) => ({
        address: market.address,
        abi: market.abi,
        functionName: 'predictions',
        args: [id],
      })),
      allowFailure: true,
      multicallAddress: MULTICALL3_ADDRESS,
    });

    let value = 0;
    let last = false;
    for (const result of results) {
      last = isRegistered(result);
      if (last) value += 1;
    }
    return { value, isFloor: last };
  } catch {
    return { value: null, isFloor: false };
  }
}

/** `registered` is the first field of predictions(id). */
function isRegistered(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const entry = result as { status?: string; result?: unknown };
  if (entry.status !== 'success') return false;
  return Array.isArray(entry.result) && entry.result[0] === true;
}

/**
 * Basis points as a percentage, without trailing zeros. 300 reads 3%, 50 reads
 * 0.5%. The contract's unit is bps and a card that printed 300 would be read as
 * 300 of something.
 */
export function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${trimZeros(percent.toFixed(2))}%`;
}

/**
 * A token amount in its own decimals. `maxFraction` caps the digits shown
 * without rounding up, so a balance is never displayed as more than it is.
 */
export function formatAmount(value: bigint, decimals: number, maxFraction = 4): string {
  const full = formatUnits(value, decimals);
  const dot = full.indexOf('.');
  if (dot === -1) return full;
  const truncated = maxFraction === 0 ? full.slice(0, dot) : full.slice(0, dot + 1 + maxFraction);
  return trimZeros(truncated);
}

function trimZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
