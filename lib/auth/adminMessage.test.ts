import { describe, it, expect } from 'vitest';
import {
  ADMIN_SIGNATURE_TTL_MS,
  buildAdminMessage,
  checkTimestamp,
  parseAdminAllowlist,
} from './adminMessage';

describe('buildAdminMessage', () => {
  it('is deterministic for the same action and timestamp', () => {
    expect(buildAdminMessage('resolve', 1000)).toBe(buildAdminMessage('resolve', 1000));
  });

  it('binds the signature to one action, so it cannot be replayed on another', () => {
    expect(buildAdminMessage('resolve', 1000)).not.toBe(buildAdminMessage('cancel', 1000));
  });

  it('changes with the timestamp', () => {
    expect(buildAdminMessage('resolve', 1000)).not.toBe(buildAdminMessage('resolve', 1001));
  });

  it('contains both the action and the timestamp verbatim', () => {
    const message = buildAdminMessage('cancel', 1771000000000);
    expect(message).toContain('action: cancel');
    expect(message).toContain('timestamp: 1771000000000');
  });
});

describe('checkTimestamp', () => {
  const now = 1_771_000_000_000;

  it('accepts a fresh timestamp', () => {
    expect(checkTimestamp(String(now), now)).toEqual({ ok: true });
    expect(checkTimestamp(String(now - 60_000), now)).toEqual({ ok: true });
  });

  it('rejects one older than the TTL', () => {
    const stale = now - ADMIN_SIGNATURE_TTL_MS - 1;
    expect(checkTimestamp(String(stale), now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts a timestamp exactly at the TTL boundary', () => {
    const edge = now - ADMIN_SIGNATURE_TTL_MS;
    expect(checkTimestamp(String(edge), now)).toEqual({ ok: true });
  });

  it('tolerates small clock skew but rejects the far future', () => {
    expect(checkTimestamp(String(now + 10_000), now)).toEqual({ ok: true });
    expect(checkTimestamp(String(now + 600_000), now)).toEqual({ ok: false, reason: 'future' });
  });

  it('rejects missing and malformed values', () => {
    expect(checkTimestamp(null, now)).toEqual({ ok: false, reason: 'missing' });
    expect(checkTimestamp('', now)).toEqual({ ok: false, reason: 'missing' });
    expect(checkTimestamp('not-a-number', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkTimestamp('1.5', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkTimestamp('-1', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkTimestamp('Infinity', now)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('parseAdminAllowlist', () => {
  it('lowercases and splits comma-separated values', () => {
    expect(
      parseAdminAllowlist(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'])
    ).toEqual([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
  });

  it('merges several sources and ignores blanks', () => {
    expect(
      parseAdminAllowlist([
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        undefined,
        '',
        ' 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ',
      ])
    ).toHaveLength(2);
  });

  it('drops anything that is not an address, so a typo cannot widen access', () => {
    expect(parseAdminAllowlist(['not-an-address', '0x123', '0x' + 'z'.repeat(40)])).toEqual([]);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(parseAdminAllowlist([undefined, undefined])).toEqual([]);
  });
});
