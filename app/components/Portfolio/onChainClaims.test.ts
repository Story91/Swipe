import { describe, it, expect } from 'vitest';
import { describeWriteError, formatCollateral } from './onChainClaims';

describe('showing an amount somebody is owed', () => {
  it('reads six-decimal collateral as money', () => {
    expect(formatCollateral(BigInt(25_000_000), 6)).toBe('25.00');
    expect(formatCollateral(BigInt(1_234_567), 6)).toBe('1.23');
    expect(formatCollateral(BigInt(0), 6)).toBe('0.00');
  });

  it('never prints a non-zero balance as zero', () => {
    // The failure this exists to stop: a claim button sitting next to the words
    // 0.00, which says there is nothing to collect while the contract holds
    // something. Anything that rounds away gets named.
    expect(formatCollateral(BigInt(1), 6)).toBe('under 0.01');
    expect(formatCollateral(BigInt(4_999), 6)).toBe('under 0.01');
    // And the first amount that really is a cent is printed as one.
    expect(formatCollateral(BigInt(10_000), 6)).toBe('0.01');
  });

  it('groups thousands, so a large reward is legible at a glance', () => {
    expect(formatCollateral(BigInt(12_345_678_901), 6)).toBe('12,345.68');
  });
});

describe('reporting a send that did not go through', () => {
  it('prefers viem\'s own one-line summary', () => {
    const error = Object.assign(new Error('a forty line report\nwith\nargs\nand a docs link'), {
      shortMessage: 'User rejected the request.',
    });
    expect(describeWriteError(error, 'fallback')).toBe('User rejected the request.');
  });

  it('takes the first line when there is no summary', () => {
    const error = new Error('Execution reverted: Nothing to claim\n\nContract Call:\n  ...');
    expect(describeWriteError(error, 'fallback')).toBe('Execution reverted: Nothing to claim');
  });

  it('falls back rather than showing an empty box', () => {
    expect(describeWriteError(undefined, 'The claim was not sent.')).toBe(
      'The claim was not sent.'
    );
    expect(describeWriteError(new Error('   '), 'The claim was not sent.')).toBe(
      'The claim was not sent.'
    );
  });
});
