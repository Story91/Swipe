import { formatUnits } from 'viem';

/**
 * The two things both new claim panels need, written once.
 *
 * CreatorRewards and Refunds are separate screens with separate contract calls,
 * but they show the same kind of thing: an amount of collateral somebody is
 * owed, and whatever went wrong when they tried to take it.
 */

/**
 * A failed send, in one line a person can read.
 *
 * viem throws a full report: the contract call, the arguments, a docs link and
 * the library version, forty-odd lines of it. Printed under a button that was
 * meant to pay someone, it reads as the app being broken rather than as the
 * wallet having said no. `shortMessage` is the sentence viem writes for humans,
 * so use that when it is there and the first line otherwise.
 */
export function describeWriteError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof short === 'string' && short.trim().length > 0) return short.trim();
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.split('\n')[0].trim();
  }
  return fallback;
}

/**
 * Raw collateral units as an amount, to two places.
 *
 * Both stablecoins here carry six decimals, so two places throws four of them
 * away, and rounding a dust balance to 0.00 next to a live claim button says
 * there is nothing there when there is. Anything that rounds away is named
 * instead of printed as zero.
 */
export function formatCollateral(units: bigint, decimals: number): string {
  const value = Number(formatUnits(units, decimals));
  if (units > BigInt(0) && value < 0.005) return 'under 0.01';
  // en-US rather than the visitor's locale, matching portfolioTokens: these sit
  // in a column beside figures written with toFixed, and a browser set to
  // Polish renders one 25,00 and the other 25.00 in the same column.
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
