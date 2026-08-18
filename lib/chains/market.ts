import { getChainConfig, getWritableMarket, type ChainKey } from './index';
import { USDG_DUALPOOL_ABI } from '../contract';

/**
 * Everything needed to talk to one chain's market, resolved together.
 *
 * This exists because the app had three separate notions of "the current chain"
 * and none of them agreed: the switcher's localStorage string, the wallet's
 * connected chainId, and a set of module-scope constants in lib/contract.ts that
 * were frozen to the build-time default at import time. A caller that took the
 * address from one and the collateral token from another produced a transaction
 * that looked right and went somewhere else.
 *
 * So address, ABI, chain id, collateral and explorer come from a single call
 * against a single chainKey. There is no way to take half of this from Base and
 * half from Robinhood without noticing.
 *
 * Note what is NOT here: permission. Holding a MarketContract is not permission
 * to write to it. Writes go through useMarketWrite, which also checks the wallet
 * is on the matching chain.
 */
export interface MarketContract {
  /** The live market on this chain. Never an archived contract. */
  address: `0x${string}`;
  /** Read from the compiled V3 artifact, so it cannot drift from the bytecode. */
  abi: typeof USDG_DUALPOOL_ABI;
  /** For pinning writes. Omitting it makes wagmi sign on the wallet's chain. */
  chainId: number;
  /**
   * The collateral this deployment holds, which is USDC on Base and USDG on
   * Robinhood. Fixed in the contract at deploy time and immutable there, so
   * reading it per chain is the only correct way: the two tokens share 6
   * decimals and different addresses, which means a hardcoded Base literal
   * fails silently rather than reverting.
   */
  collateral: { address: `0x${string}`; symbol: string; decimals: number };
  /** Per chain. Basescan for Base, Blockscout for Robinhood. */
  explorer: string;
}

/**
 * The market on `key`, or null when that chain has none deployed.
 *
 * Null is the honest answer for Robinhood today and for any chain whose address
 * is not reachable from where this runs. Callers must render that state rather
 * than falling back to another chain's contract.
 */
export function getMarketContract(key: ChainKey): MarketContract | null {
  const address = getWritableMarket(key);
  if (!address) return null;

  const config = getChainConfig(key);
  return {
    address,
    abi: USDG_DUALPOOL_ABI,
    chainId: config.viemChain.id,
    collateral: {
      address: config.stable.address,
      symbol: config.stable.symbol,
      decimals: config.stable.decimals,
    },
    explorer: config.explorer,
  };
}

/**
 * Link to a transaction on the chain it actually happened on.
 *
 * Transaction history stores its explorer URL at write time rather than deriving
 * it at render, so a link written with the wrong host is wrong permanently. Use
 * this at the moment of writing and pass the chain the transaction was signed
 * on, not the chain selected now.
 */
export function txUrl(key: ChainKey, hash: string): string {
  return `${getChainConfig(key).explorer}/tx/${hash}`;
}

/** Link to an address on the chain it lives on. Same reasoning as txUrl. */
export function addressUrl(key: ChainKey, address: string): string {
  return `${getChainConfig(key).explorer}/address/${address}`;
}

/**
 * The exit value of a position, computed the way the contract computes it.
 *
 * V3 dropped the old pool's calculateExitValue view, so this is the client-side
 * copy of contracts/PredictionMarket_V4.sol exitEarly. Kept in one place because
 * two copies of payout maths drift, and this one decides what a user is told
 * they will receive.
 *
 * The `oppositePool == 0` branch matters: the old contract returned zero there,
 * V3 pays principal less the fee. Code carried over from the old pool will tell
 * a solo exiter they get nothing when they would get 95%.
 */
export function exitValue(params: {
  amount: bigint;
  isYes: boolean;
  yesPool: bigint;
  noPool: bigint;
  earlyExitFeeBps: bigint;
}): { gross: bigint; fee: bigint; net: bigint } {
  // BigInt(...) rather than the 10000n literal: tsconfig targets below ES2020,
  // where bigint literals are a compile error.
  const BASIS_POINTS = BigInt(10000);
  const ZERO = BigInt(0);
  const { amount, isYes, yesPool, noPool, earlyExitFeeBps } = params;

  const totalPool = yesPool + noPool;
  if (totalPool === ZERO || amount === ZERO) return { gross: ZERO, fee: ZERO, net: ZERO };

  const oppositePool = isYes ? noPool : yesPool;

  // Nobody on the other side: principal back, less the exit fee.
  const gross =
    oppositePool === ZERO
      ? amount
      : (amount * ((oppositePool * BASIS_POINTS) / totalPool)) / BASIS_POINTS;

  const fee = (gross * earlyExitFeeBps) / BASIS_POINTS;
  return { gross, fee, net: gross - fee };
}

/**
 * Whether an exit of `amount` would be refused for emptying its side.
 *
 * V3 refuses, in the final quarter of a market's life only, an exit that would
 * leave its side's pool at zero. The old pool had no such rule, so a UI carried
 * over from it offers a full exit that reverts with "Would empty the pool" after
 * the user has already signed.
 *
 * `createdAt` is only on predictions(id), not on getPrediction(id).
 */
export function wouldEmptyPool(params: {
  amount: bigint;
  isYes: boolean;
  yesPool: bigint;
  noPool: bigint;
  createdAt: bigint;
  deadline: bigint;
  now: bigint;
}): boolean {
  const { amount, isYes, yesPool, noPool, createdAt, deadline, now } = params;

  const window = deadline - createdAt;
  const elapsed = now - createdAt;
  // Same multiply-not-divide comparison the contract uses, so no integer
  // division decides the bracket.
  const inFinalQuarter = elapsed * BigInt(4) >= window * BigInt(3);
  if (!inFinalQuarter) return false;

  const side = isYes ? yesPool : noPool;
  return side - amount === BigInt(0);
}

/**
 * positions(id, user), decoded without collapsing the sides.
 *
 * The contract lets one address hold YES and NO on the same market at once,
 * and exitEarly is per side. Both existing consumers of this read pick the
 * larger side and throw the other away, which renders a two-sided position as
 * one and makes half of it un-exitable from the screen. This decoder returns
 * both amounts and nothing else decides which one matters.
 *
 * Slots 2 and 3 are time weights, not amounts, so they are deliberately not
 * surfaced here: an exit UI that showed them as money would overstate the
 * position.
 */
export interface PositionSides {
  yesAmount: bigint;
  noAmount: bigint;
  claimed: boolean;
}

export function decodePositionSides(
  data: readonly unknown[] | undefined | null
): PositionSides | null {
  if (!data || data.length < 5) return null;
  const [yesAmount, noAmount, , , claimed] = data as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
  ];
  if (typeof yesAmount !== 'bigint' || typeof noAmount !== 'bigint') return null;
  return { yesAmount, noAmount, claimed: Boolean(claimed) };
}

/**
 * Everything the contract will check before it lets this exit through, run
 * before the wallet opens.
 *
 * The refusal is a sentence a user can read, or null when the exit would go
 * through. The checks mirror bettingOpen and exitEarly in the contract's own
 * order, so the first reason the chain would give is the first reason shown.
 * A disabled button with the sentence under it costs nothing; the same
 * refusal discovered on chain costs a signature and the gas.
 *
 * The value maths is exitValue above, unchanged, so the quote and the payout
 * cannot drift apart.
 */
export interface ExitQuote {
  gross: bigint;
  fee: bigint;
  net: bigint;
  /** Null when the exit would go through. Otherwise, why it would not. */
  refusal: string | null;
}

export function exitQuote(params: {
  amount: bigint;
  isYes: boolean;
  held: bigint;
  yesPool: bigint;
  noPool: bigint;
  createdAt: bigint;
  deadline: bigint;
  now: bigint;
  earlyExitFeeBps: bigint;
  resolved: boolean;
  cancelled: boolean;
  refundable: boolean;
}): ExitQuote {
  const ZERO = BigInt(0);
  const {
    amount,
    isYes,
    held,
    yesPool,
    noPool,
    createdAt,
    deadline,
    now,
    earlyExitFeeBps,
    resolved,
    cancelled,
    refundable,
  } = params;

  const value = exitValue({ amount, isYes, yesPool, noPool, earlyExitFeeBps });
  const refuse = (refusal: string): ExitQuote => ({ ...value, refusal });

  // bettingOpen, in the contract's order.
  if (resolved) {
    return refuse('This market has settled. Winnings are claimed, not exited.');
  }
  if (cancelled) {
    return refuse('This market was cancelled. Your stake comes back as a refund, not an exit.');
  }
  if (refundable) {
    return refuse('This market is refundable. Your stake comes back as a refund, not an exit.');
  }
  if (now >= deadline) {
    return refuse('Betting has closed on this market, and exits close with it.');
  }

  // exitEarly's own requires.
  if (amount === ZERO) {
    return refuse('Enter an amount to exit.');
  }
  if (amount > held) {
    return refuse('You hold less than that on this side.');
  }
  if (wouldEmptyPool({ amount, isYes, yesPool, noPool, createdAt, deadline, now })) {
    return refuse(
      'In the last quarter of a market an exit cannot empty its side of the pool. ' +
        'Exit a little less, or wait for settlement.'
    );
  }
  if (yesPool + noPool === ZERO) {
    return refuse('The pool is empty, so there is nothing to exit into.');
  }
  if (value.net === ZERO) {
    return refuse('After the exit fee this amount would round to nothing.');
  }

  return { ...value, refusal: null };
}
