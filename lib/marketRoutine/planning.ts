/**
 * Pure planning arithmetic for the weekly routine: which threshold a market
 * gets, when it closes, and how the question reads. No IO, so every rule here
 * is unit tested directly.
 */

const DAY = 86_400;

export function roundTwoSignificant(value: number): number {
  return Number(value.toPrecision(2));
}

/**
 * Threshold distance scales with the token's own 24h movement, clamped to a
 * 3% to 10% band. Direction alternates by batch index so the weekend's set is
 * not one-sided: even indexes need a rise for YES, odd indexes only need the
 * price to hold.
 *
 * Rounded to two significant digits, except when that rounding lands the
 * threshold on the price or across it (103 rounds to 100 for a $100 token,
 * erasing the whole distance); then a third digit is kept.
 */
export function pickThreshold(
  priceUsd: number,
  change24hPct: number,
  index: number
): number {
  const distance = Math.min(10, Math.max(3, Math.abs(change24hPct)));
  const above = index % 2 === 0;
  const target = priceUsd * (above ? 1 + distance / 100 : 1 - distance / 100);
  const two = roundTwoSignificant(target);
  const stillOnItsSide = above ? two > priceUsd : two < priceUsd;
  return stillOnItsSide ? two : Number(target.toPrecision(3));
}

/**
 * The fixed weekend grid, all UTC: Friday 20:00, Saturday 20:00, Saturday
 * 23:59, Sunday 18:00, Sunday 23:59. Anchored to the first Friday whose 20:00
 * is at least 24 hours after `nowUnix`, so a batch never opens a market that
 * closes within a day.
 */
export function weekendDeadlines(nowUnix: number): number[] {
  for (let t = nowUnix; ; t += DAY) {
    const d = new Date(t * 1000);
    if (d.getUTCDay() !== 5) continue;
    const dayStart =
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const friday2000 = dayStart + 20 * 3600;
    if (friday2000 < nowUnix + DAY) continue;
    return [
      friday2000,
      dayStart + DAY + 20 * 3600,
      dayStart + DAY + 23 * 3600 + 59 * 60,
      dayStart + 2 * DAY + 18 * 3600,
      dayStart + 2 * DAY + 23 * 3600 + 59 * 60,
    ];
  }
}

/**
 * The threshold exactly as chosen, formatted for a question: thousands get
 * separators, tiny prices never flip into exponent form. This must not round
 * again; the question and the resolutionSpec have to show the same number.
 */
export function formatThreshold(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  const s = String(value);
  if (!s.includes('e')) return s;
  // String() falls back to exponent form below 1e-6; rebuild fixed form.
  return value.toFixed(12).replace(/0+$/, '');
}

export function buildQuestion(symbol: string, threshold: number): string {
  return `Will ${symbol} be above $${formatThreshold(threshold)} when this market closes?`;
}
