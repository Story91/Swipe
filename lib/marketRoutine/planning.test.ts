import { describe, it, expect } from 'vitest';
import {
  roundTwoSignificant,
  pickThreshold,
  weekendDeadlines,
  formatThreshold,
  buildQuestion,
} from './planning';

describe('roundTwoSignificant', () => {
  it('keeps two significant digits at any magnitude', () => {
    expect(roundTwoSignificant(64728)).toBe(65000);
    expect(roundTwoSignificant(0.4712)).toBe(0.47);
    expect(roundTwoSignificant(0.0001234)).toBe(0.00012);
  });
});

describe('pickThreshold', () => {
  it('clamps the distance to 3 percent when the token barely moved', () => {
    // 0.5% clamps to 3%, target 103. Two significant digits would collapse
    // that to 100, the price itself, so the fallback keeps a third digit.
    expect(pickThreshold(100, 0.5, 0)).toBe(103);
  });
  it('clamps the distance to 10 percent for wild tokens', () => {
    expect(pickThreshold(100, 25, 0)).toBe(110);
  });
  it('alternates direction by index', () => {
    // 105 rounds up to 110 at two significant digits, still above the price.
    expect(pickThreshold(100, 5, 0)).toBe(110);
    expect(pickThreshold(100, 5, 1)).toBe(95);
  });
  it('uses the absolute change for the distance', () => {
    expect(pickThreshold(100, -8, 0)).toBe(110);
  });
  it('never lands on the wrong side of the price', () => {
    // Target 98.94 rounds to 99, still below 102, so two digits suffice here.
    expect(pickThreshold(102, 3, 1)).toBe(99);
  });
});

describe('weekendDeadlines', () => {
  it('builds the grid for the Friday after a Wednesday run', () => {
    // Wednesday 2026-08-19 12:07 UTC. Grid values were computed by hand for
    // the 2026-08-21 weekend and cross-checked against live markets created
    // this week.
    const wednesday = Date.UTC(2026, 7, 19, 12, 7, 0) / 1000;
    expect(weekendDeadlines(wednesday)).toEqual([
      1787342400, // Fri 21 Aug 20:00
      1787428800, // Sat 22 Aug 20:00
      1787443140, // Sat 22 Aug 23:59
      1787508000, // Sun 23 Aug 18:00
      1787529540, // Sun 23 Aug 23:59
    ]);
  });
  it('skips to next week when Friday 20:00 is less than 24h away', () => {
    const fridayNoon = Date.UTC(2026, 7, 21, 12, 0, 0) / 1000;
    const grid = weekendDeadlines(fridayNoon);
    expect(grid[0]).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) / 1000);
    expect(grid).toHaveLength(5);
  });
});

describe('formatThreshold', () => {
  it('renders every magnitude without scientific notation', () => {
    expect(formatThreshold(64000)).toBe('64,000');
    expect(formatThreshold(92)).toBe('92');
    expect(formatThreshold(6.6)).toBe('6.6');
    expect(formatThreshold(0.49)).toBe('0.49');
    expect(formatThreshold(0.00012)).toBe('0.00012');
    expect(formatThreshold(0.00000024)).toBe('0.00000024');
  });
  it('never rounds a three-digit threshold away', () => {
    expect(formatThreshold(0.484)).toBe('0.484');
    expect(formatThreshold(103)).toBe('103');
  });
});

describe('buildQuestion', () => {
  it('uses the single provable template', () => {
    expect(buildQuestion('AERO', 0.49)).toBe(
      'Will AERO be above $0.49 when this market closes?'
    );
  });
});
