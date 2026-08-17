import { describe, it, expect } from 'vitest';
import { bucketOf, groupMarkets, toAdminMarket } from './adminMarkets';
import type { RedisPrediction } from '@/lib/types/redis';

/**
 * The proposal queue, tested against the records production actually holds.
 *
 * One proposal exists on Base and the admin screen did not show it. Two
 * separate reasons, both reproduced below: the list was narrowed to `pred_v1_`
 * and `pred_v2_` ids before anything else ran, and the Redis set that names
 * pending markets is polluted with nineteen settled V2 markets. Either one on
 * its own is enough to make the queue useless, so both have a case here.
 */

function make(over: Partial<RedisPrediction> & { id: string }): RedisPrediction {
  return {
    question: 'Will something happen?',
    description: '',
    category: 'crypto',
    imageUrl: '',
    includeChart: false,
    endDate: '',
    endTime: '',
    deadline: 1_787_090_340,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: 1_787_000_000,
    creator: '0x76211da24aedaf913a7795e814e59011cdbc4264',
    verified: false,
    approved: false,
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    ...over,
  };
}

/** The real one, copied off production. */
const REAL_PROPOSAL = make({
  id: 'pred_v4_2',
  question: 'Will Swipe got his first buyer today at 18.08.2026 , before the 23:59 UTC',
  creator: '0x76211da24aedaf913a7795e814e59011cdbc4264',
  deadline: 1_787_090_340,
  needsApproval: true,
  approved: false,
});

/** Before the deadline in that proposal. */
const NOW = 1_787_000_500;

describe('bucketOf', () => {
  it('puts the one real proposal in the proposal queue', () => {
    expect(bucketOf(toAdminMarket(REAL_PROPOSAL), NOW)).toBe('proposal');
  });

  it('keeps a settled V2 market out of the queue however the pending set is polluted', () => {
    const old = make({ id: 'pred_v2_181', approved: true, needsApproval: false });
    expect(bucketOf(toAdminMarket(old), NOW)).toBe('archived');
  });

  it('will not offer a V2 market as a proposal even when its record says it needs approval', () => {
    const old = make({ id: 'pred_v2_181', approved: false, needsApproval: true });
    expect(bucketOf(toAdminMarket(old), NOW)).toBe('archived');
  });

  it('moves a proposal out of the queue once a sync has seen it on chain', () => {
    const registered = make({ ...REAL_PROPOSAL, usdcPoolEnabled: true });
    expect(bucketOf(toAdminMarket(registered), NOW)).toBe('running');
  });

  it('asks for a decision once the deadline has gone', () => {
    const expired = make({
      id: 'pred_v4_1',
      deadline: NOW - 60,
      needsApproval: false,
      approved: true,
      usdcPoolEnabled: true,
    });
    expect(bucketOf(toAdminMarket(expired), NOW)).toBe('settle');
  });

  it('archives an id it cannot read rather than offering a button for it', () => {
    expect(bucketOf(toAdminMarket(make({ id: 'not-a-market-id' })), NOW)).toBe('archived');
  });
});

describe('groupMarkets', () => {
  const feed: RedisPrediction[] = [
    REAL_PROPOSAL,
    make({ id: 'pred_v4_9', needsApproval: true, approved: false, createdAt: 1_786_000_000 }),
    make({ id: 'pred_v2_181', approved: true, needsApproval: false }),
    make({ id: 'pred_v2_204', approved: true, needsApproval: false }),
    make({ id: 'pred_v4_1', deadline: NOW - 60, approved: true, usdcPoolEnabled: true }),
    make({ id: 'pred_v4_3', deadline: NOW + 7200, approved: true, usdcPoolEnabled: true }),
  ];

  it('surfaces both proposals and nothing else', () => {
    const groups = groupMarkets(feed, NOW);
    expect(groups.proposal.map((m) => m.id)).toEqual(['pred_v4_9', 'pred_v4_2']);
    expect(groups.settle.map((m) => m.id)).toEqual(['pred_v4_1']);
    expect(groups.running.map((m) => m.id)).toEqual(['pred_v4_3']);
    expect(groups.archived.map((m) => m.id)).toEqual(['pred_v2_181', 'pred_v2_204']);
  });

  it('drops a row out of the queue the moment its receipt lands', () => {
    const groups = groupMarkets(feed, NOW, new Set(['pred_v4_2']));
    expect(groups.proposal.map((m) => m.id)).toEqual(['pred_v4_9']);
    expect(groups.running.map((m) => m.id)).toContain('pred_v4_2');
  });

  it('reads the market number the register call needs', () => {
    const [proposal] = groupMarkets([REAL_PROPOSAL], NOW).proposal;
    expect(proposal.number).toBe(2);
    expect(proposal.creator).toBe('0x76211da24aedaf913a7795e814e59011cdbc4264');
    expect(proposal.deadline).toBe(1_787_090_340);
  });
});
