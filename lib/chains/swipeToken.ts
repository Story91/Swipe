import { getChainConfig } from './index';
import type { ChainKey } from './types';

/**
 * $WIPE on Robinhood chain, and the bonding curve that sells it.
 *
 * The token was launched through Pons v2, so it is not sitting in a DEX pool
 * with a router in front of it. It is held by one curve contract that prices
 * every buy against its own reserves and hands the tokens over directly. That
 * makes buying from inside this app a single call with native ETH attached,
 * and it makes the price something this file can compute rather than something
 * an API has to be asked for.
 *
 * WHY THE MATHS IS COPIED HERE. PonsV2BondingCurve.buy takes `minTokensOut`,
 * so a screen that cannot predict the output cannot set a bound and has to
 * send zero, which is the same as signing a blank cheque on a curve anyone
 * else can move first. The functions below are a line for line port of
 * PonsV2BondingCurve.buy and PonsV2BondingCurveMath, integer division and
 * clamping included, taken from the verified source of PonsV2LaunchDeployer,
 * which carries the curve as one of its own sources. If they drift from the
 * contract the quote is wrong in the user's favour or against it, so
 * lib/chains/swipeToken.test.ts pins the cases the contract treats specially:
 * the partial fill, the fee gross-up, the rounding.
 *
 * WHAT IS NOT HERE. Selling. The curve has a `sell`, this app does not call
 * it, and adding it would be a decision rather than an omission.
 *
 * THE ADDRESSES. Both are literals with NEXT_PUBLIC_ overrides, matching the
 * market addresses in ./index. The curve address is never treated as
 * permission on its own: isSwipeCurve compares the address a caller is about
 * to send ETH to, and the buy path additionally checks the curve's own
 * `token()` against the token below, because a wrong address here would be a
 * transfer of native ETH into a contract that owes the sender nothing.
 */

const BASIS_POINTS = BigInt(10000);
const ZERO = BigInt(0);
const ONE = BigInt(1);

export interface SwipeTokenLaunch {
  /** The only chain this token exists on. Not the switcher's current chain. */
  chainKey: ChainKey;
  chainId: number;
  token: `0x${string}`;
  /** PonsV2BondingCurve. Holds the unsold supply and prices every buy. */
  curve: `0x${string}`;
  /** name() on the token contract. */
  name: string;
  /** symbol() on the token contract, which is not the same as its name. */
  symbol: string;
  decimals: number;
  /** The curve trades against native ETH, so this is the gas token too. */
  quoteSymbol: string;
  quoteDecimals: number;
  launchpad: string;
  explorer: string;
}

const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_WIPE_TOKEN
  || '0xF04866Ce5bD35F771e4eDa35d618761fFceee7B9') as `0x${string}`;

const CURVE_ADDRESS = (process.env.NEXT_PUBLIC_WIPE_CURVE
  || '0x64e48e69b59aa3FD07Ac630FF76FB6fD5Db3C475') as `0x${string}`;

/**
 * Read once at module scope because both addresses are fixed at deploy time
 * and neither depends on which chain the switcher points at.
 */
export const SWIPE_TOKEN_LAUNCH: SwipeTokenLaunch = {
  chainKey: 'robinhood',
  chainId: getChainConfig('robinhood').viemChain.id,
  token: TOKEN_ADDRESS,
  curve: CURVE_ADDRESS,
  // Verified on chain: name() is "SWIPE" and symbol() is "WIPE". They differ,
  // and printing the name where the ticker belongs would be a small lie that
  // sends people looking for the wrong string on an explorer.
  name: 'SWIPE',
  symbol: 'WIPE',
  decimals: 18,
  quoteSymbol: getChainConfig('robinhood').viemChain.nativeCurrency.symbol,
  quoteDecimals: getChainConfig('robinhood').viemChain.nativeCurrency.decimals,
  launchpad: 'Pons',
  explorer: getChainConfig('robinhood').explorer,
};

/** The token's page on the launchpad that created it. */
export function launchpadUrl(): string {
  return `https://www.ponsfamily.com/launchpad/${SWIPE_TOKEN_LAUNCH.token}`;
}

/**
 * True only when `target` is exactly the curve that sells this token, on the
 * chain it lives on.
 *
 * Same shape and same reason as isWritableMarket in ./index. A buy sends
 * native ETH, and ether sent to an address with no code does not revert, it
 * lands and stays there. So the address a caller is about to write to gets
 * compared rather than the chain it thinks it is on.
 */
export function isSwipeCurve(key: ChainKey, target: string | null | undefined): boolean {
  if (key !== SWIPE_TOKEN_LAUNCH.chainKey) return false;
  if (!target) return false;
  return target.toLowerCase() === SWIPE_TOKEN_LAUNCH.curve.toLowerCase();
}

/**
 * The slice of PonsV2BondingCurve this app actually calls.
 *
 * `sell` is deliberately absent: an ABI that does not describe a function is
 * one more thing standing between a stray call site and a transaction nobody
 * intended.
 */
export const PONS_CURVE_ABI = [
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'quoteIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'quoteReserve_', type: 'uint256' },
      { name: 'tokenReserve_', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'realQuoteReserve',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellableTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentSnipeTaxBps',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'feeBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creatorTaxBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'graduationThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'graduated', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'token', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

export interface SwipeCurveContract {
  address: `0x${string}`;
  abi: typeof PONS_CURVE_ABI;
  chainId: number;
  token: `0x${string}`;
  explorer: string;
}

/**
 * The curve on `key`, or null when this token does not live there.
 *
 * Null for Base and for both testnets, and that is the honest answer rather
 * than a reason to fall back to Robinhood's address while the rest of the
 * screen says Base.
 */
export function getSwipeCurve(key: ChainKey): SwipeCurveContract | null {
  if (key !== SWIPE_TOKEN_LAUNCH.chainKey) return null;
  const address = SWIPE_TOKEN_LAUNCH.curve;
  if (!address || /^0x0{40}$/i.test(address)) return null;
  return {
    address,
    abi: PONS_CURVE_ABI,
    chainId: SWIPE_TOKEN_LAUNCH.chainId,
    token: SWIPE_TOKEN_LAUNCH.token,
    explorer: SWIPE_TOKEN_LAUNCH.explorer,
  };
}

/* ------------------------------------------------------------------ maths */

function amountOut(input: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  // PonsV2BondingCurveMath.getAmountOut with feeBps 0, which is how buy()
  // calls it: the fee legs are already off the input by then.
  return (input * reserveOut) / (reserveIn + input);
}

function amountIn(out: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  // getAmountIn, again at feeBps 0. The trailing +1 is the contract's, and it
  // is what keeps a clamped fill from being priced a wei short.
  return (out * reserveIn) / (reserveOut - out) + ONE;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - ONE) / b;
}

export interface BuyQuote {
  /** What the curve will actually take. Less than the offer on a clamped fill. */
  spend: bigint;
  /** Returned in the same transaction when the fill was clamped. */
  refund: bigint;
  tokensOut: bigint;
  fee: bigint;
  creatorTax: bigint;
  snipeTax: bigint;
  /** True when the buy ran into the reserved allocation and was filled short. */
  clamped: boolean;
  /** Null when the buy would go through. Otherwise, why it would not. */
  refusal: string | null;
}

const NO_FILL = {
  spend: ZERO,
  refund: ZERO,
  tokensOut: ZERO,
  fee: ZERO,
  creatorTax: ZERO,
  snipeTax: ZERO,
  clamped: false,
};

/**
 * What `buy` would do with this offer, computed the way the curve computes it.
 *
 * Everything the contract will check before it lets the buy through is checked
 * here first, in the contract's own order, so the first reason the chain would
 * give is the first reason on screen. A refusal costs nothing; the same
 * refusal found on chain costs a signature and the gas.
 *
 * The clamp is the part worth reading twice. A buy that would take the curve
 * past its reserved allocation is not rejected, it is filled up to the
 * allocation, charged only for what it received and refunded the rest, all in
 * the same transaction. So the quote reports a spend smaller than the offer,
 * and a caller that assumed otherwise would show a price per token wrong by
 * whatever came back.
 */
export function buyQuote(params: {
  /** The ETH the buyer is offering, in wei. */
  offer: bigint;
  /** getReserves(), which includes the phantom liquidity the curve prices on. */
  quoteReserve: bigint;
  tokenReserve: bigint;
  /** sellableTokens(), the part of the balance the curve will part with. */
  sellable: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  snipeTaxBps: bigint;
  graduated: boolean;
}): BuyQuote {
  const { offer, quoteReserve, tokenReserve, sellable, feeBps, creatorTaxBps, graduated } = params;

  const refuse = (refusal: string): BuyQuote => ({ ...NO_FILL, refusal });

  if (graduated) {
    return refuse('This curve has graduated, so it no longer sells the token.');
  }
  if (offer <= ZERO) {
    return refuse(`Enter an amount of ${SWIPE_TOKEN_LAUNCH.quoteSymbol} to spend.`);
  }
  if (quoteReserve <= ZERO || tokenReserve <= ZERO) {
    return refuse('The curve reported no reserves, so there is nothing to price against.');
  }
  if (sellable <= ZERO) {
    return refuse('The curve has sold its whole allocation, so there is nothing left to buy here.');
  }

  // The snipe tax rides the quote leg like the other two and carries its own
  // bound, so the combined take always leaves the buyer at least 1%. Skipped
  // when it is zero, which it is once a launch is a few seconds old.
  let snipeTaxBps = params.snipeTaxBps;
  if (snipeTaxBps !== ZERO) {
    const maxSnipeTaxBps = BASIS_POINTS - feeBps - creatorTaxBps - BigInt(100);
    if (snipeTaxBps > maxSnipeTaxBps) snipeTaxBps = maxSnipeTaxBps;
  }

  const takeBps = feeBps + creatorTaxBps + snipeTaxBps;
  if (takeBps >= BASIS_POINTS) {
    return refuse('The curve is charging everything this buy is worth.');
  }

  let spend = offer;
  let fee = (spend * feeBps) / BASIS_POINTS;
  let creatorTax = (spend * creatorTaxBps) / BASIS_POINTS;
  let snipeTax = (spend * snipeTaxBps) / BASIS_POINTS;
  // Mirrors getAmountOut's InsufficientInputAmount guard. Unreachable while
  // the combined take is bounded below 100%, since every leg is floored:
  // kept here because this function's job is to be the contract, not to be
  // shorter than it.
  const net = spend - fee - creatorTax - snipeTax;
  if (net <= ZERO) {
    return refuse('After the curve fee this amount would buy nothing. Spend more.');
  }

  let tokensOut = amountOut(net, quoteReserve, tokenReserve);
  if (tokensOut === ZERO) {
    return refuse('This amount rounds to zero tokens on the curve. Spend more.');
  }

  let clamped = false;
  if (tokensOut > sellable) {
    clamped = true;
    tokensOut = sellable;
    const needed = amountIn(sellable, quoteReserve, tokenReserve);
    const grossed = ceilDiv(needed * BASIS_POINTS, BASIS_POINTS - takeBps);
    spend = grossed < offer ? grossed : offer;
    fee = (spend * feeBps) / BASIS_POINTS;
    creatorTax = (spend * creatorTaxBps) / BASIS_POINTS;
    snipeTax = (spend * snipeTaxBps) / BASIS_POINTS;
  }

  return {
    spend,
    refund: offer - spend,
    tokensOut,
    fee,
    creatorTax,
    snipeTax,
    clamped,
    refusal: null,
  };
}

/**
 * The floor to send as `minTokensOut`.
 *
 * The curve reads this as a bound on price rather than on quantity whenever it
 * clamps a fill, which is what makes a partial fill honour the caller's terms
 * instead of reverting on them. Rounding down is deliberate: rounding up would
 * set a bound the quote itself does not meet.
 */
export function minTokensOut(tokensOut: bigint, slippageBps: number): bigint {
  if (tokensOut <= ZERO) return ZERO;
  const bounded = Math.max(0, Math.min(10000, Math.trunc(slippageBps)));
  return (tokensOut * (BASIS_POINTS - BigInt(bounded))) / BASIS_POINTS;
}

/**
 * How far the curve is from graduating, in basis points of its threshold.
 *
 * Measured on the real quote reserve, not the reserve the curve prices with:
 * the phantom liquidity is not money anyone paid in, so counting it would show
 * a launch as 40% funded on its first block.
 */
export function curveProgressBps(realQuoteReserve: bigint, graduationThreshold: bigint): number {
  if (graduationThreshold <= ZERO) return 0;
  const capped = realQuoteReserve > graduationThreshold ? graduationThreshold : realQuoteReserve;
  return Number((capped * BASIS_POINTS) / graduationThreshold);
}

/**
 * Spot price in whole ETH per whole token, as a float, for display only.
 *
 * Both decimals have to be passed. Dividing raw reserve by raw reserve gives
 * wei per whole token, which on this launch is a number around 7.5 billion and
 * reads on screen as though the token costs more than the chain it lives on.
 *
 * Never feed the result back into a transaction. It is the marginal price at
 * zero size, so any real buy pays more than it, and it goes through Number on
 * the way out.
 */
export function spotPrice(
  quoteReserve: bigint,
  tokenReserve: bigint,
  tokenDecimals: number,
  quoteDecimals: number
): number {
  if (quoteReserve <= ZERO || tokenReserve <= ZERO) return 0;
  const wholeToken = BigInt(10) ** BigInt(tokenDecimals);
  const wholeQuote = BigInt(10) ** BigInt(quoteDecimals);
  // Scaled by 1e18 before the divide so a price far below one wei per token
  // survives the cast to Number instead of truncating to zero.
  const scaled = (quoteReserve * wholeToken * BigInt(10) ** BigInt(18)) / (tokenReserve * wholeQuote);
  return Number(scaled) / 1e18;
}
