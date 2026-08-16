import { describe, it, expect } from 'vitest';
import { isEmbedUrl, thumbKindFor, hueFromSeed, initialsFor } from './marketThumb';

describe('isEmbedUrl', () => {
  it('recognises the GeckoTerminal embed crypto markets actually store', () => {
    expect(
      isEmbedUrl(
        'https://www.geckoterminal.com/eth/pools/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599?embed=1&info=0&swaps=0'
      )
    ).toBe(true);
  });

  it('treats ordinary image hosts as images', () => {
    expect(isEmbedUrl('https://i.ibb.co/abc/photo.png')).toBe(false);
    expect(isEmbedUrl('https://images.unsplash.com/photo-123?w=400')).toBe(false);
  });

  it('handles missing values', () => {
    expect(isEmbedUrl(undefined)).toBe(false);
    expect(isEmbedUrl(null)).toBe(false);
    expect(isEmbedUrl('')).toBe(false);
  });
});

describe('thumbKindFor', () => {
  it('routes embeds to the chart tile and blanks to the generated tile', () => {
    expect(thumbKindFor('https://www.geckoterminal.com/eth/pools/0x1?embed=1')).toBe('chart');
    expect(thumbKindFor('https://i.ibb.co/x.png')).toBe('image');
    expect(thumbKindFor('')).toBe('generated');
    expect(thumbKindFor(undefined)).toBe('generated');
  });
});

describe('hueFromSeed', () => {
  it('is stable for the same seed', () => {
    expect(hueFromSeed('pred_v2_42')).toBe(hueFromSeed('pred_v2_42'));
  });

  it('always produces a valid hue', () => {
    for (const seed of ['', 'a', 'pred_v2_1', 'pred_v2_999', '🙂']) {
      const hue = hueFromSeed(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(Number.isInteger(hue)).toBe(true);
    }
  });
});

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Will BTC hit 100k')).toBe('WB');
  });

  it('falls back to two letters of a single word', () => {
    expect(initialsFor('Bitcoin')).toBe('BI');
  });

  it('ignores punctuation and never returns an empty string', () => {
    expect(initialsFor('$SWIPE — moon?')).toBe('SM');
    expect(initialsFor('???')).toBe('?');
    expect(initialsFor('')).toBe('?');
  });
});
