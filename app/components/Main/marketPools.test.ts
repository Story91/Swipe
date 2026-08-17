import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { weightBracket } from './weightBracket';

/**
 * The multiplier shown under the card has to be the one the contract will apply.
 *
 * If the strip says a bet counts x1.50 and weightBpsAt disagrees, the user is
 * told they are buying a better share of the losing pool than they are. So this
 * pins the boundaries against the arithmetic in PredictionMarket_V4.sol, and
 * reads that file to confirm the arithmetic has not moved underneath.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = path.join(HERE, '../../../contracts/PredictionMarket_V4.sol');

const OPEN = 1_000_000;
/** A four hour market, so each quarter is exactly 3600 seconds. */
const CLOSE = OPEN + 14_400;
const QUARTER = 3_600;

describe('which weight bracket a bet lands in', () => {
  it('pays the early weight through the whole first quarter', () => {
    expect(weightBracket(OPEN, OPEN, CLOSE)).toBe(0);
    expect(weightBracket(OPEN + 1, OPEN, CLOSE)).toBe(0);
    expect(weightBracket(OPEN + QUARTER - 1, OPEN, CLOSE)).toBe(0);
  });

  it('steps to the middle weight exactly on the quarter, not before', () => {
    // The contract's test is `elapsed * 4 < window`, so elapsed == window/4 is
    // already out of the early bracket. An off-by-one here overstates the
    // multiplier for anyone betting on the boundary.
    expect(weightBracket(OPEN + QUARTER, OPEN, CLOSE)).toBe(1);
    expect(weightBracket(OPEN + 2 * QUARTER - 1, OPEN, CLOSE)).toBe(1);
  });

  it('drops to the flat weight at the halfway mark and stays there', () => {
    // Not the last quarter. `elapsed * 2 < window` means the third and fourth
    // quarters pay the same, and describing this as "the last quarter" would
    // tell someone betting at 60% of the way through that they still get a
    // premium.
    expect(weightBracket(OPEN + 2 * QUARTER, OPEN, CLOSE)).toBe(2);
    expect(weightBracket(OPEN + 3 * QUARTER, OPEN, CLOSE)).toBe(2);
    expect(weightBracket(CLOSE - 1, OPEN, CLOSE)).toBe(2);
  });

  it('clamps outside the window the way the contract does', () => {
    expect(weightBracket(OPEN - 500, OPEN, CLOSE)).toBe(0);
    expect(weightBracket(CLOSE, OPEN, CLOSE)).toBe(2);
    expect(weightBracket(CLOSE + 5000, OPEN, CLOSE)).toBe(2);
  });

  it('answers unknown rather than guessing when the record has no opening time', () => {
    // The card's own `createdAt` is fabricated as deadline minus a day. Feeding
    // that in would put every bet on a week long market in the flat bracket.
    // Absent has to read as absent.
    expect(weightBracket(OPEN + 10, undefined, CLOSE)).toBe(-1);
    expect(weightBracket(OPEN + 10, OPEN, undefined)).toBe(-1);
    expect(weightBracket(OPEN + 10, 0, CLOSE)).toBe(-1);
    // A window that is not positive cannot be divided into quarters.
    expect(weightBracket(OPEN + 10, CLOSE, OPEN)).toBe(-1);
  });
});

describe('the contract this mirrors', () => {
  const source = readFileSync(CONTRACT, 'utf8');

  it('still uses the two comparisons this function copies', () => {
    // Multiply, never divide, so no integer division decides a boundary. If
    // either line changes, the strip is describing a payout rule that is gone.
    expect(source).toContain('if (elapsed * 4 < window) return WEIGHT_EARLY;');
    expect(source).toContain('if (elapsed * 2 < window) return WEIGHT_MID;');
  });

  it('still clamps at both ends before doing the arithmetic', () => {
    expect(source).toContain('if (timestamp <= pred.createdAt) return WEIGHT_EARLY;');
    expect(source).toContain('if (timestamp >= pred.deadline) return WEIGHT_LATE;');
  });
});
