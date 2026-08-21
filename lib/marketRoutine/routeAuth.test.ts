import { describe, it, expect } from 'vitest';
import { isCronAuthorized } from './routeAuth';

describe('isCronAuthorized', () => {
  it('accepts exactly the configured bearer secret', () => {
    expect(isCronAuthorized('Bearer s3cret', 's3cret')).toBe(true);
  });
  it('rejects wrong or absent headers', () => {
    expect(isCronAuthorized('Bearer wrong', 's3cret')).toBe(false);
    expect(isCronAuthorized(null, 's3cret')).toBe(false);
    expect(isCronAuthorized('s3cret', 's3cret')).toBe(false);
  });
  it('fails closed when the secret is not configured', () => {
    expect(isCronAuthorized('Bearer anything', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
  });
});
