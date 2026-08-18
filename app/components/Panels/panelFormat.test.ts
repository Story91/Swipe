import { describe, it, expect } from 'vitest';
import {
  activityLine,
  advance,
  countUpValue,
  easeOutCubic,
  formatCount,
  formatMoney,
  MAX_FRAME_SECONDS,
  shortAddress,
  timeAgo,
  wrapOffset,
  type ActivityItem,
} from './panelFormat';

const NOW = 1_800_000_000_000;

/** Stands in for the chain, so the module under test never has to know one. */
const symbolFor = (token: string) => (token === 'USDC' ? 'USDG' : token);

describe('wrapOffset', () => {
  it('folds a running offset into one copy of the track', () => {
    expect(wrapOffset(0, 400)).toBe(0);
    expect(wrapOffset(-120, 400)).toBe(-120);
    expect(wrapOffset(-400, 400)).toBe(0);
    expect(wrapOffset(-520, 400)).toBe(-120);
    expect(wrapOffset(-1720, 400)).toBe(-120);
  });

  it('folds a drag to the right back inside the track', () => {
    // Without this the reader drags past the left edge of copy one and sees the
    // blank page behind the track.
    expect(wrapOffset(80, 400)).toBe(-320);
    expect(wrapOffset(880, 400)).toBe(-320);
  });

  it('never leaves the track anywhere it can show a gap', () => {
    const span = 337;
    for (let x = -2000; x <= 2000; x += 7) {
      const wrapped = wrapOffset(x, span);
      expect(wrapped).toBeGreaterThan(-span);
      expect(wrapped).toBeLessThanOrEqual(0);
    }
  });

  it('parks at zero when nothing has been measured yet', () => {
    expect(wrapOffset(-90, 0)).toBe(0);
    expect(wrapOffset(-90, Number.NaN)).toBe(0);
  });

  it('does not hand back negative zero', () => {
    expect(Object.is(wrapOffset(-400, 400), -0)).toBe(false);
  });
});

describe('advance', () => {
  it('moves left at the speed it is given', () => {
    // A sixty hertz frame at 30px a second.
    expect(advance(0, 30, 1 / 60)).toBeCloseTo(-0.5);
  });

  it('caps a frame, so a backgrounded tab does not teleport the track', () => {
    expect(advance(0, 30, 12)).toBeCloseTo(-30 * MAX_FRAME_SECONDS);
  });

  it('ignores a frame with no time in it', () => {
    expect(advance(-40, 30, 0)).toBe(-40);
  });
});

describe('countUpValue', () => {
  it('starts at zero and lands exactly on the target', () => {
    expect(countUpValue(525, 0)).toBe(0);
    expect(countUpValue(525, 1)).toBe(525);
    expect(countUpValue(525, 4)).toBe(525);
  });

  it('never overshoots the figure it is counting to', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      expect(countUpValue(1234.56, t, 2)).toBeLessThanOrEqual(1234.56);
    }
  });

  it('keeps the decimals it is asked for', () => {
    expect(countUpValue(10, 0.5, 2)).toBe(Math.round(10 * easeOutCubic(0.5) * 100) / 100);
  });

  it('rises', () => {
    expect(countUpValue(100, 0.25)).toBeLessThan(countUpValue(100, 0.75));
  });
});

describe('formatCount', () => {
  it('prints small counts whole', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1)).toBe('1');
    expect(formatCount(525)).toBe('525');
    expect(formatCount(9999)).toBe('9999');
  });

  it('shortens once the digits stop being readable', () => {
    expect(formatCount(10_000)).toBe('10.0k');
    expect(formatCount(1_500_000)).toBe('1.5M');
  });
});

describe('formatMoney', () => {
  it('says a pool holds something rather than rounding it to zero', () => {
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(0.004)).toBe('<0.01');
    expect(formatMoney(25)).toBe('25.00');
    expect(formatMoney(1234.5)).toBe('1,235');
    expect(formatMoney(48_000)).toBe('48.0k');
  });
});

describe('timeAgo', () => {
  it('reads shortest first', () => {
    expect(timeAgo(NOW - 5_000, NOW)).toBe('just now');
    expect(timeAgo(NOW - 90_000, NOW)).toBe('1m ago');
    expect(timeAgo(NOW - 7_200_000, NOW)).toBe('2h ago');
    expect(timeAgo(NOW - 3 * 86_400_000, NOW)).toBe('3d ago');
    expect(timeAgo(NOW - 60 * 86_400_000, NOW)).toBe('2mo ago');
    expect(timeAgo(NOW - 400 * 86_400_000, NOW)).toBe('1y ago');
  });
});

describe('shortAddress', () => {
  it('matches the shape the route already builds', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678');
  });

  it('leaves something too short to shorten alone', () => {
    expect(shortAddress('0xabc')).toBe('0xabc');
    expect(shortAddress(undefined)).toBe('someone');
  });
});

describe('activityLine', () => {
  const base = {
    id: 'x',
    timestamp: NOW,
    user: { address: '0x1234567890abcdef1234567890abcdef12345678', displayName: '0x1234...5678', avatar: '🐋' },
    prediction: { id: 'pred_v4_1', question: 'Will ETH close above 4k?', category: 'crypto' },
  };

  it('names the verbs the route actually emits', () => {
    // The panel's old label map was keyed on stake_placed and reward_claimed.
    // /api/activity has never emitted either, so two of its four rows fell
    // through to the fallback and printed the raw type.
    const bet = activityLine(
      { ...base, type: 'bet_placed', details: { amount: 25, token: 'USDC', choice: 'YES' } } as ActivityItem,
      symbolFor
    );
    expect(bet.verb).toBe('backed');

    const claim = activityLine(
      { ...base, type: 'payout_claimed', details: { payout: 41.5, stake: 25, token: 'USDC' } } as ActivityItem,
      symbolFor
    );
    expect(claim.verb).toBe('claimed on');

    expect(activityLine({ ...base, type: 'prediction_created' } as ActivityItem, symbolFor).verb).toBe('opened');
    expect(activityLine({ ...base, type: 'prediction_resolved' } as ActivityItem, symbolFor).verb).toBe('settled');
  });

  it('names the token from the chain, never from the storage key', () => {
    const bet = activityLine(
      { ...base, type: 'bet_placed', details: { amount: 25, token: 'USDC', choice: 'YES' } } as ActivityItem,
      symbolFor
    );
    expect(bet.amount).toBe('25.00 USDG');
  });

  it('shows the payout on a claim, not the stake', () => {
    const claim = activityLine(
      { ...base, type: 'payout_claimed', details: { payout: 41.5, stake: 25, token: 'USDC' } } as ActivityItem,
      symbolFor
    );
    expect(claim.amount).toBe('41.50 USDG');
  });

  it('leaves out an amount the route did not send', () => {
    const created = activityLine({ ...base, type: 'prediction_created' } as ActivityItem, symbolFor);
    expect(created.amount).toBeNull();
    expect(created.side).toBeNull();

    // A figure with no token beside it cannot be labelled, so it is not shown.
    const untyped = activityLine(
      { ...base, type: 'bet_placed', details: { amount: 25 } } as ActivityItem,
      symbolFor
    );
    expect(untyped.amount).toBeNull();
  });

  it('reads the side off a bet and off a settlement', () => {
    expect(
      activityLine(
        { ...base, type: 'bet_placed', details: { amount: 1, token: 'USDC', choice: 'NO' } } as ActivityItem,
        symbolFor
      ).side
    ).toBe('NO');

    expect(
      activityLine(
        { ...base, type: 'prediction_resolved', details: { outcome: 'YES' } } as ActivityItem,
        symbolFor
      ).side
    ).toBe('YES');
  });

  it('falls back to the address when the route sent no display name', () => {
    const line = activityLine(
      { id: 'y', type: 'bet_placed', timestamp: NOW, user: { address: '0x1234567890abcdef1234567890abcdef12345678' } } as ActivityItem,
      symbolFor
    );
    expect(line.who).toBe('0x1234...5678');
    expect(line.market).toBeNull();
  });
});
