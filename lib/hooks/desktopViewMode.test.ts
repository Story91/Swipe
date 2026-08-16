import { describe, it, expect } from 'vitest';
import {
  DESKTOP_VIEW_MODE_KEY,
  DEFAULT_DESKTOP_VIEW_MODE,
  parseViewMode,
} from './desktopViewMode';

describe('desktop view mode', () => {
  it('defaults to grid, because a desktop visitor arrives to browse', () => {
    expect(DEFAULT_DESKTOP_VIEW_MODE).toBe('grid');
  });

  it('accepts the two known modes', () => {
    expect(parseViewMode('grid')).toBe('grid');
    expect(parseViewMode('swipe')).toBe('swipe');
  });

  it('falls back to the default for anything unrecognised', () => {
    expect(parseViewMode(null)).toBe('grid');
    expect(parseViewMode(undefined)).toBe('grid');
    expect(parseViewMode('')).toBe('grid');
    expect(parseViewMode('tinder')).toBe('grid');
    expect(parseViewMode('{"mode":"swipe"}')).toBe('grid');
  });

  it('uses a namespaced storage key so it cannot collide with other app state', () => {
    expect(DESKTOP_VIEW_MODE_KEY).toBe('swipe:desktop-view-mode');
  });
});
