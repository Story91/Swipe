import { describe, it, expect } from 'vitest';
import {
  archivedUnits,
  isApportioned,
  rankByPool,
  rowStake,
  shownPoolTotal,
} from './leaderboardMath';

const row = (eth: number, swipe: number) => ({
  totalStakedETH: eth,
  totalStakedSWIPE: swipe,
});

describe('archivedUnits', () => {
  it('divides every amount, including ones below the old 1e15 threshold', () => {
    // The case the guess got wrong. 0.0005 ETH is a real V2 position and the
    // old code printed it as five hundred million million ETH.
    expect(archivedUnits(5e14)).toBeCloseTo(0.0005, 12);
    expect(archivedUnits(1e18)).toBe(1);
    expect(archivedUnits(0)).toBe(0);
  });

  it('does not treat a small raw amount as already denominated', () => {
    expect(archivedUnits(1)).toBeLessThan(1e-17);
  });
});

describe('isApportioned', () => {
  it('reads a rescan summary, already divided, as measured', () => {
    expect(isApportioned({ totalETHStaked: 5.2, totalSWIPEStaked: 1_200_000_000 })).toBe(false);
  });

  it('reads a raw wei summary as apportioned', () => {
    expect(isApportioned({ totalETHStaked: 5.2e18 })).toBe(true);
    expect(isApportioned({ totalETHStaked: 0, totalSWIPEStaked: 1.2e27 })).toBe(true);
  });

  it('treats an absent or empty summary as measured, which shows no warning', () => {
    expect(isApportioned(undefined)).toBe(false);
    expect(isApportioned({})).toBe(false);
    expect(isApportioned({ totalETHStaked: 0, totalSWIPEStaked: 0 })).toBe(false);
  });

  it('keeps a wide margin between the two writers', () => {
    // A billion SWIPE from the rescan is 1e9. The same holding from the
    // simplified collector is 1e27. The threshold sits six orders above the
    // first and nine below the second.
    expect(isApportioned({ totalSWIPEStaked: 1e9 })).toBe(false);
    expect(isApportioned({ totalSWIPEStaked: 1e27 })).toBe(true);
  });
});

describe('rowStake', () => {
  it('reads one pool and never the other', () => {
    const r = row(3e18, 900e18);
    expect(rowStake(r, 'eth')).toBe(3e18);
    expect(rowStake(r, 'swipe')).toBe(900e18);
  });
});

describe('shownPoolTotal', () => {
  it('totals one pool in readable units', () => {
    expect(shownPoolTotal([row(1e18, 0), row(5e17, 0)], 'eth')).toBeCloseTo(1.5, 12);
  });

  it('leaves the other pool out entirely', () => {
    // If the two were ever added, the SWIPE holding here would swamp the ETH
    // one and the figure would be labelled ETH.
    expect(shownPoolTotal([row(1e18, 900e18)], 'eth')).toBeCloseTo(1, 12);
    expect(shownPoolTotal([row(1e18, 900e18)], 'swipe')).toBeCloseTo(900, 9);
  });

  it('is zero for no rows', () => {
    expect(shownPoolTotal([], 'eth')).toBe(0);
  });
});

describe('rankByPool', () => {
  it('orders on the selected pool and renumbers from one', () => {
    const rows = [
      { ...row(1e18, 900e18), address: 'a' },
      { ...row(9e18, 1e18), address: 'b' },
      { ...row(4e18, 500e18), address: 'c' },
    ];

    expect(rankByPool(rows, 'eth').map((r) => [r.address, r.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);

    // The same three people in a different order, because the other pool is a
    // different question and not a tiebreak on the first.
    expect(rankByPool(rows, 'swipe').map((r) => [r.address, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 3],
    ]);
  });

  it('never lets a dust holding in one token outrank a real one in the other', () => {
    // One wei of ETH against nine hundred whole SWIPE. Added together as raw
    // numbers the SWIPE row wins by 1e21, which is the exact failure mode a
    // cross token ranking has.
    const rows = [
      { ...row(1, 0), address: 'dust' },
      { ...row(0, 900e18), address: 'real' },
    ];
    expect(rankByPool(rows, 'eth')[0].address).toBe('dust');
    expect(rankByPool(rows, 'swipe')[0].address).toBe('real');
  });

  it('does not mutate the array it was given', () => {
    const rows = [{ ...row(1e18, 0) }, { ...row(9e18, 0) }];
    rankByPool(rows, 'eth');
    expect(rows[0].totalStakedETH).toBe(1e18);
  });
});
