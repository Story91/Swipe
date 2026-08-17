import { describe, expect, it } from 'vitest';
import { chartPoints, formatDeadline, formatPool, yesPriceOf } from './marketDetail';

/*
 * The detail page used to print a pool of zero on every live market because it
 * read the V2 wei fields instead of the collateral ones. These cover the maths
 * that replaced it, and each one fails if the corresponding line is reverted:
 * flip the 6-decimal divisor and the pool assertions go, drop the synthetic
 * start point and the chart assertions go.
 */

describe('yesPriceOf', () => {
  it('is the pool share in cents', () => {
    expect(yesPriceOf(62_000_000, 38_000_000)).toBe(62);
    // 62.5, and Math.round takes a half upwards. Same behaviour as the USDC
    // markets screen, so the two never disagree by a cent on the same market.
    expect(yesPriceOf(25_000_000, 15_000_000)).toBe(63);
  });

  it('is 50 on an empty market rather than undefined or NaN', () => {
    expect(yesPriceOf(0, 0)).toBe(50);
  });

  it('never returns NaN for a negative or broken total', () => {
    expect(yesPriceOf(-5, 5)).toBe(50);
  });
});

describe('formatPool', () => {
  it('reads the collateral at six decimals, not wei', () => {
    // The number the page used to divide by 1e18 and print as 0.00000.
    expect(formatPool(12_340_000)).toBe('$12.34');
  });

  it('abbreviates past a thousand', () => {
    expect(formatPool(1_200_000_000)).toBe('$1.2k');
  });

  it('says zero out loud', () => {
    expect(formatPool(0)).toBe('$0.00');
  });
});

describe('formatDeadline', () => {
  const now = 1_700_000_000;

  it('names the coarsest unit that is still true', () => {
    expect(formatDeadline(now + 3 * 86400, now)).toBe('3d');
    expect(formatDeadline(now + 6 * 3600, now)).toBe('6h');
    expect(formatDeadline(now + 45 * 60, now)).toBe('45m');
  });

  it('never shows 0m for a market with seconds left', () => {
    expect(formatDeadline(now + 20, now)).toBe('1m');
  });

  it('says Ended once the deadline has passed', () => {
    expect(formatDeadline(now - 1, now)).toBe('Ended');
    expect(formatDeadline(now, now)).toBe('Ended');
  });
});

describe('chartPoints', () => {
  it('always opens at 50/50, so one bet is a line and not a dot', () => {
    const points = chartPoints([], 62, 38, 40_000_000);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ time: 'Start', yes: 50, no: 50 });
    expect(points[1]).toEqual({ time: 'Now', yes: 62, no: 38 });
  });

  it('draws nothing but the start when there is no money and no history', () => {
    expect(chartPoints([], 50, 50, 0)).toEqual([{ time: 'Start', yes: 50, no: 50 }]);
  });

  it('keeps the stored history in order behind the start point', () => {
    const points = chartPoints(
      [
        { timestamp: 1_700_000_000_000, yesPrice: 55, noPrice: 45 },
        { timestamp: 1_700_003_600_000, yesPrice: 70, noPrice: 30 },
      ],
      70,
      30,
      40_000_000
    );
    expect(points).toHaveLength(3);
    expect(points[0].time).toBe('Start');
    expect(points.map((p) => p.yes)).toEqual([50, 55, 70]);
    expect(points.map((p) => p.no)).toEqual([50, 45, 30]);
  });
});
