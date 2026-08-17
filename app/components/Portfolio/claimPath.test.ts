import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { parseMarketId, canonicalMarketId, CURRENT_GENERATION } from '../../../lib/marketId';

/**
 * Claiming is the only screen where the user is owed money rather than risking
 * it, and it was broken for every market on every contract that takes bets.
 *
 * The handler derived the market number with a ladder of string strips:
 * pred_v1_, then pred_v2_, then a bare `pred_` as the catch-all. A prefixed id
 * from any later generation fell into that last arm, so `pred_v3_9` became
 * parseInt('v3_9'), which is NaN, and the function alerted "Invalid prediction
 * ID" and returned. Everything downstream, including the branch that routes the
 * claim to the live contract, was unreachable. Nobody lost money, but nobody
 * could collect it either, and the failure named the id rather than the bug.
 *
 * Two of these are behavioural and pin the arithmetic. The rest scan source,
 * following lib/chains/no-direct-imports.test.ts and swipeMoneyPath.test.ts,
 * because what is being protected is the absence of a shape: the ladder must not
 * come back, and the routing must not name a generation that will stop being
 * current.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const DASHBOARD = path.join(ROOT, 'app', 'components', 'Portfolio', 'EnhancedUserDashboard.tsx');

const source = readFileSync(DASHBOARD, 'utf8');

/**
 * The handler that sends a claim, isolated from the rest of the file.
 *
 * Sliced rather than scanned whole, because V1 and V2 read paths elsewhere in
 * this component still strip their own prefixes and are correct to: those ids
 * really do carry those prefixes and the contracts behind them are archived.
 * Asserting over the whole file would either fail on them or be watered down
 * until it proved nothing about the part that pays out.
 */
function claimHandler(): string {
  const start = source.indexOf('const handleClaimReward');
  expect(start, 'handleClaimReward has been renamed; this test needs repointing').toBeGreaterThan(-1);
  // To the next top-level const arrow at the same indentation, which is the
  // next handler along.
  const rest = source.slice(start + 1);
  const end = rest.search(/\n {2}const \w+ = (async )?\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('deriving the market number a claim is for', () => {
  it('reads every generation, including the ones the ladder could not', () => {
    // The exact inputs the old ladder turned into NaN.
    expect(parseMarketId('pred_v3_9')?.numericId).toBe(9);
    expect(parseMarketId('pred_v4_9')?.numericId).toBe(9);
    // And the ones it did handle, which must keep working.
    expect(parseMarketId('pred_v1_9')?.numericId).toBe(9);
    expect(parseMarketId('pred_v2_9')?.numericId).toBe(9);
    expect(parseMarketId('pred_9')?.numericId).toBe(9);
  });

  it('is what the ladder got wrong, demonstrated rather than asserted', () => {
    // Kept as executable evidence of the bug. If someone reintroduces the
    // ladder, this is what it does to a current-generation id.
    const id = canonicalMarketId(CURRENT_GENERATION, 9);
    const viaLadder = parseInt(
      id.replace('pred_v1_', '').replace('pred_v2_', '').replace('pred_', ''),
      10
    );
    expect(Number.isNaN(viaLadder)).toBe(true);
    expect(parseMarketId(id)?.numericId).toBe(9);
  });

  it('refuses an id it cannot parse instead of sending a claim for NaN', () => {
    expect(parseMarketId('../../etc/passwd')).toBeNull();
    expect(parseMarketId('pred_')).toBeNull();
  });
});

describe('the claim handler itself', () => {
  it('derives the number through the parser, not by stripping prefixes', () => {
    const handler = claimHandler();
    expect(handler).toMatch(/parseMarketId\(predictionId\)/);
    expect(
      handler,
      'the prefix-stripping ladder is back, and it turns every prefixed id into NaN'
    ).not.toMatch(/parseInt\(\s*predictionId\.replace\(/);
  });

  it('routes to the live contract by the generation the config calls current', () => {
    const handler = claimHandler();
    // The branch existed before and was dead, because it compared against the
    // literal 'v3' while the config had moved on. A literal here is the bug.
    expect(handler).toMatch(/generation === CURRENT_GENERATION/);
    expect(
      handler,
      "a literal generation in the claim routing goes stale the next time the " +
        'contract is replaced, and sends the claim to the archived pool'
    ).not.toMatch(/generation === ['"]v\d['"]/);
  });

  it('treats a market with no winners as a refund, not as winnings', () => {
    const handler = claimHandler();
    // The contract flags this as refundable and rejects claimWinnings on it
    // with "Not claimable". /api/sync/usdc has stored the flag since V3.
    expect(handler).toMatch(/usdcRefundable/);
    expect(handler).toMatch(/claimRefund/);
  });
});
