import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { refundState, timeUntilRefundsOpen, REFUND_GRACE_SECONDS } from './refundState';

/**
 * The grace period is a promise the contract makes to somebody whose money is
 * stuck, so the boundary is worth pinning rather than eyeballing.
 *
 * Two of these read the Solidity itself. A constant copied into TypeScript and
 * then changed on chain is the sort of drift that shows a countdown ending on
 * the wrong day, and the comparison being strict rather than loose is the
 * difference between a button that works and a revert the user pays for.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = path.join(HERE, '..', 'contracts', 'PredictionMarket_V4.sol');
const solidity = readFileSync(CONTRACT, 'utf8');

const DEADLINE = BigInt(1_800_000_000);
const OPENS_AT = DEADLINE + REFUND_GRACE_SECONDS;

const base = {
  registered: true,
  resolved: false,
  cancelled: false,
  refundable: false,
  deadline: DEADLINE,
  now: DEADLINE + BigInt(1),
  yesAmount: BigInt(25_000_000),
  noAmount: BigInt(0),
  claimed: false,
};

describe('the constant matches the contract', () => {
  it('is 30 days, as PredictionMarket_V4 declares it', () => {
    expect(solidity).toMatch(/REFUND_GRACE_PERIOD\s*=\s*30 days/);
    expect(REFUND_GRACE_SECONDS).toBe(BigInt(2_592_000));
  });

  it('compares strictly, because enableRefundsAfterGrace does', () => {
    // `block.timestamp > pred.deadline + REFUND_GRACE_PERIOD`. A `>=` here
    // would offer the button one second before the chain accepts the call.
    expect(solidity).toMatch(
      /block\.timestamp > pred\.deadline \+ REFUND_GRACE_PERIOD/
    );
  });
});

describe('a market the contract has never heard of', () => {
  it('is not offered a refund button, however old the clock says it is', () => {
    // getPrediction has no predictionExists modifier, so an unknown id reads an
    // empty struct: registered false and deadline 0. A zero deadline puts
    // "thirty days past" somewhere in 1970, so every check downstream says the
    // grace period is long over. Without the registered flag this renders as
    // ready for refunds and the button reverts on the modifier
    // enableRefundsAfterGrace does have.
    const empty = {
      registered: false,
      resolved: false,
      cancelled: false,
      refundable: false,
      deadline: BigInt(0),
      now: BigInt(1_800_000_000),
      yesAmount: BigInt(0),
      noAmount: BigInt(0),
      claimed: false,
    };
    expect(refundState(empty).stage).toBe('unknown');
    expect(refundState(empty).stage).not.toBe('openable');
  });

  it('stays unknown even when the mapping looks populated', () => {
    // Belt and braces: the flag wins over every other input, so a partially
    // decoded read cannot talk its way into a button.
    expect(refundState({ ...base, registered: false, refundable: true }).stage).toBe('unknown');
  });
});

describe('when refunds can be opened', () => {
  it('is not openable at exactly deadline plus grace', () => {
    expect(refundState({ ...base, now: OPENS_AT }).stage).toBe('waiting');
  });

  it('is openable one second later', () => {
    expect(refundState({ ...base, now: OPENS_AT + BigInt(1) }).stage).toBe('openable');
  });

  it('is still just open before the deadline', () => {
    expect(refundState({ ...base, now: DEADLINE - BigInt(1) }).stage).toBe('open');
  });

  it('never offers to open refunds on a market that resolved', () => {
    // enableRefundsAfterGrace requires !resolved, whatever the clock says.
    const long = { ...base, resolved: true, now: OPENS_AT + BigInt(1_000_000) };
    expect(refundState(long).stage).toBe('settled');
  });
});

describe('claiming the refund once it is open', () => {
  const refundable = { ...base, refundable: true, now: OPENS_AT + BigInt(10) };

  it('offers the raw stake back, both sides summed and unweighted', () => {
    const view = refundState({
      ...refundable,
      yesAmount: BigInt(25_000_000),
      noAmount: BigInt(5_000_000),
    });
    expect(view.stage).toBe('claimable');
    expect(view.amount).toBe(BigInt(30_000_000));
  });

  it('does not offer it twice', () => {
    expect(refundState({ ...refundable, claimed: true }).stage).toBe('taken');
  });

  it('does not offer it to somebody who exited out of the whole position', () => {
    const gone = { ...refundable, yesAmount: BigInt(0), noAmount: BigInt(0) };
    expect(refundState(gone).stage).toBe('empty');
  });

  it('covers a cancelled market and a market with no winners, not just abandonment', () => {
    // Both set `refundable` on chain, so both land on the same branch.
    expect(refundState({ ...base, cancelled: true, refundable: true }).stage).toBe('claimable');
    expect(refundState({ ...base, resolved: true, refundable: true }).stage).toBe('claimable');
  });
});

describe('the countdown', () => {
  it('counts whole days while there are days left', () => {
    expect(timeUntilRefundsOpen(OPENS_AT, OPENS_AT - BigInt(3 * 86400) - BigInt(60))).toBe(
      'in 3 days'
    );
    expect(timeUntilRefundsOpen(OPENS_AT, OPENS_AT - BigInt(86400))).toBe('in 1 day');
  });

  it('drops to hours on the last day', () => {
    expect(timeUntilRefundsOpen(OPENS_AT, OPENS_AT - BigInt(2 * 3600))).toBe('in 2 hours');
    expect(timeUntilRefundsOpen(OPENS_AT, OPENS_AT - BigInt(600))).toBe('in under an hour');
  });

  it('does not count backwards once the moment has passed', () => {
    expect(timeUntilRefundsOpen(OPENS_AT, OPENS_AT + BigInt(5))).toBe('any moment now');
  });
});
