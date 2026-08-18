import { describe, it, expect } from 'vitest';
import { marketCensus } from './marketCensus';
import type { RedisPrediction } from '@/lib/types/redis';

/**
 * The two figures the strip used to get wrong, pinned.
 *
 * Both were wrong in the same direction: they folded a frozen archive into a
 * live figure and printed the total as if it described the app today. So the
 * cases below are all about the boundary between the two piles.
 */

const NOW = 1_800_000_000;

function make(over: Partial<RedisPrediction> & { id: string }): RedisPrediction {
  return {
    question: 'Will it?',
    description: '',
    category: 'crypto',
    imageUrl: '',
    includeChart: false,
    endDate: '',
    endTime: '',
    deadline: NOW + 3600,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: NOW - 3600,
    creator: '0xcreator',
    verified: true,
    approved: true,
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    ...over,
  };
}

describe('marketCensus', () => {
  it('keeps the archived generations out of the live counts', () => {
    const census = marketCensus(
      [
        make({ id: 'pred_v1_1' }),
        make({ id: 'pred_v2_9' }),
        make({ id: 'pred_7' }),
        make({ id: 'pred_v3_2' }),
        make({ id: 'pred_v4_1' }),
      ],
      NOW
    );

    expect(census.markets).toBe(1);
    expect(census.open).toBe(1);
    expect(census.archived).toBe(4);
  });

  it('counts a proposal as waiting, not as a market', () => {
    const census = marketCensus(
      [make({ id: 'pred_v4_5', needsApproval: true, approved: false })],
      NOW
    );

    expect(census.awaiting).toBe(1);
    expect(census.markets).toBe(0);
    expect(census.open).toBe(0);
  });

  it('counts a registered market even while its record still says it needs approval', () => {
    // Nothing clears needsApproval after a market goes on chain, so the
    // registration flag has to win or a live market is invisible forever.
    const census = marketCensus(
      [
        make({
          id: 'pred_v4_5',
          needsApproval: true,
          approved: false,
          usdcPoolEnabled: true,
        }),
      ],
      NOW
    );

    expect(census.awaiting).toBe(0);
    expect(census.markets).toBe(1);
    expect(census.open).toBe(1);
  });

  it('shuts a market at its deadline and when the collateral contract settles it', () => {
    const census = marketCensus(
      [
        make({ id: 'pred_v4_1', deadline: NOW - 1 }),
        make({ id: 'pred_v4_2', usdcResolved: true }),
        make({ id: 'pred_v4_3', usdcCancelled: true }),
        make({ id: 'pred_v4_4', deadline: NOW + 1 }),
      ],
      NOW
    );

    expect(census.markets).toBe(4);
    expect(census.open).toBe(1);
  });

  it('pools the collateral fields and never the ETH ones', () => {
    // 0.391 ETH sat in yesTotalAmount as 3.91e17 wei. Adding it to a six
    // decimal figure would report 391000000000000000 dollars of collateral.
    const census = marketCensus(
      [
        make({
          id: 'pred_v4_1',
          yesTotalAmount: 3.91e17,
          swipeNoTotalAmount: 5e18,
          usdcYesTotalAmount: 25_000_000,
          usdcNoTotalAmount: 5_000_000,
        }),
      ],
      NOW
    );

    expect(census.pooledRaw).toBe(30_000_000);
  });

  it('keeps archived collateral apart from live collateral', () => {
    const census = marketCensus(
      [
        make({ id: 'pred_v2_1', usdcYesTotalAmount: 7_000_000 }),
        make({ id: 'pred_v4_1', usdcYesTotalAmount: 2_000_000 }),
      ],
      NOW
    );

    expect(census.pooledRaw).toBe(2_000_000);
    expect(census.archivedPooledRaw).toBe(7_000_000);
  });

  it('counts a wallet once across both participant lists', () => {
    const census = marketCensus(
      [
        make({
          id: 'pred_v4_1',
          participants: ['0xAAA'],
          usdcParticipants: ['0xaaa', '0xbbb'],
        }),
        make({ id: 'pred_v4_2', usdcParticipants: ['0xBBB', '0xccc'] }),
      ],
      NOW
    );

    expect(census.players).toBe(3);
  });

  it('does not count players on the archived contracts as live players', () => {
    const census = marketCensus(
      [
        make({ id: 'pred_v2_1', participants: ['0x1', '0x2', '0x3'] }),
        make({ id: 'pred_v4_1', usdcParticipants: ['0x9'] }),
      ],
      NOW
    );

    expect(census.players).toBe(1);
  });

  it('reports zeros for a chain with nothing on it', () => {
    expect(marketCensus([], NOW)).toEqual({
      open: 0,
      markets: 0,
      awaiting: 0,
      archived: 0,
      players: 0,
      pooledRaw: 0,
      archivedPooledRaw: 0,
    });
  });
});
