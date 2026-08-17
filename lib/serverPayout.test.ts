import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * Every server side money figure has to be the contract's arithmetic.
 *
 * The portfolio, the leaderboard and the activity feed each computed a payout
 * as `backing * (1 + losingPool / winningPool)`. That is wrong twice, and both
 * errors point the same way, upward.
 *
 * It takes no fee, although the contract removes the platform and creator cuts
 * from the losing pool before dividing it. And it divides by the raw pool when
 * the contract divides by the weighted one, so a late bet is handed the share
 * an early bet paid a premium for. On an even market a 10 stake was reported as
 * 10 profit where the contract pays 9.65; on a ranking, the weighting error is
 * not a rounding difference, it changes the order.
 *
 * These are source scans. The property is that three specific files use the one
 * tested function rather than growing their own copy again, and no unit test of
 * estimatePosition can see that.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const ROUTES = [
  'app/api/portfolio/route.ts',
  'app/api/leaderboard/route.ts',
  'app/api/activity/route.ts',
];

function source(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe.each(ROUTES)('%s', (rel) => {
  const body = source(rel);

  it('uses the shared payout function rather than its own arithmetic', () => {
    expect(body).toMatch(/estimatePosition\(/);
  });

  it('takes the fee rates from the contract, not from a literal', () => {
    expect(body).toMatch(/getFeeBps\(chain\)/);
    expect(body).toMatch(/platformFeeBps: fees\.platform/);
    expect(body).toMatch(/creatorFeeBps: fees\.creator/);
  });

  it('does not multiply a stake by one plus the raw pool ratio again', () => {
    // The exact shape that was wrong in all three.
    expect(
      body,
      'the fee-free pro rata payout is back in this route, and it overstates ' +
        'every profit figure it produces'
    ).not.toMatch(/\*\s*\(1\s*\+\s*losingPool\s*\/\s*winningPool\)/);
  });

  it('prefers the weighted pool, and only falls back when there is none', () => {
    expect(body).toMatch(/weightedYesPool|weightedNoPool/);
    // The fallback has to be conditional. Passing the raw pool unconditionally
    // is the same bug wearing the new function's name.
    expect(body).toMatch(/usable\s*\?/);
  });
});

describe('the fee reader', () => {
  const body = source('lib/chains/fees.ts');

  it('falls back to the launch rates, never to zero', () => {
    // Zero fees would silently overstate every figure on the page, which is the
    // bug this file exists to remove.
    expect(body).toMatch(/platform: 300/);
    expect(body).toMatch(/creator: 50/);
    expect(body).not.toMatch(/platform: 0\b/);
  });

  it('reads the live configuration rather than trusting those numbers', () => {
    expect(body).toMatch(/functionName: 'getFeeConfig'/);
  });
});
