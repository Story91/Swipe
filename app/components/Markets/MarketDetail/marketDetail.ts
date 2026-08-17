/**
 * Pure helpers for the market detail page.
 *
 * Kept out of the components so the price and pool maths can be tested without
 * a chain, a wallet or a render. Every raw number here is the market's
 * collateral in on-chain units: 6 decimals on USDC and on USDG alike, which is
 * why the pool figures on this page are not the same shape as the wei figures
 * the old ETH view used.
 *
 * No React and no CSS import, same reason as marketThumb.ts.
 */

/** One point of the stored price line. The payload carries more; this is what gets drawn. */
export interface PricePoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
}

/** One point after it has been shaped for the chart. */
export interface ChartPoint {
  time: string;
  yes: number;
  no: number;
}

/**
 * The YES price in cents.
 *
 * Parimutuel, so a price is a pool share and nothing else: the side holding 62
 * percent of the money is trading at 62c. An empty market is 50/50 rather than
 * undefined, because that is what the two sides are worth before anybody has
 * an opinion.
 */
export function yesPriceOf(yesPool: number, noPool: number): number {
  const total = yesPool + noPool;
  if (!(total > 0)) return 50;
  return Math.round((yesPool / total) * 100);
}

/** Pool size, in the market's own collateral. */
export function formatPool(raw: number, decimals = 6): string {
  const amount = raw / 10 ** decimals;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  if (amount > 0) return `$${amount.toFixed(2)}`;
  return '$0.00';
}

/** How long is left, at the coarsest unit that is still true. */
export function formatDeadline(deadline: number, nowSeconds = Date.now() / 1000): string {
  const diff = deadline - nowSeconds;
  if (diff <= 0) return 'Ended';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/**
 * The line the chart draws.
 *
 * The Start..Now axis is not an axis feature, it is these two synthetic points.
 * Every market opens at 50/50 whether or not anyone recorded it, so the line
 * always starts there; without it a market with one bet in it draws a single
 * dot and reads as broken. When there is no stored history but there is money
 * in the pool, the current price is the second point, so the card still shows
 * which way the market moved.
 */
export function chartPoints(
  history: PricePoint[],
  yesPrice: number,
  noPrice: number,
  totalPool: number
): ChartPoint[] {
  const start: ChartPoint = { time: 'Start', yes: 50, no: 50 };

  if (history.length > 0) {
    return [
      start,
      ...history.map((p) => ({
        time: new Date(p.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        yes: p.yesPrice,
        no: p.noPrice,
      })),
    ];
  }

  if (totalPool > 0) {
    return [start, { time: 'Now', yes: yesPrice, no: noPrice }];
  }

  return [start];
}
