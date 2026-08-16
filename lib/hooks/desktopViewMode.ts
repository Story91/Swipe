'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Desktop-only view mode.
 *
 * `grid`  - many markets at once, full width, no side rails. The default,
 *           because a desktop visitor arrives to scan what is on offer.
 * `swipe` - one large card plus product side rails, preserving the mechanic
 *           the app is named after.
 *
 * Mobile never reads this: below the desktop breakpoint the app stays on the
 * swipe layout regardless.
 */
export type DesktopViewMode = 'grid' | 'swipe';

export const DESKTOP_VIEW_MODE_KEY = 'swipe:desktop-view-mode';
export const DEFAULT_DESKTOP_VIEW_MODE: DesktopViewMode = 'grid';

/** Narrows an untrusted stored value; anything unexpected falls back to the default. */
export function parseViewMode(value: string | null | undefined): DesktopViewMode {
  return value === 'grid' || value === 'swipe' ? value : DEFAULT_DESKTOP_VIEW_MODE;
}

export function useDesktopViewMode() {
  // Always start from the default so server and first client render agree;
  // the stored preference is applied after mount to avoid a hydration mismatch.
  const [mode, setMode] = useState<DesktopViewMode>(DEFAULT_DESKTOP_VIEW_MODE);

  useEffect(() => {
    try {
      setMode(parseViewMode(window.localStorage.getItem(DESKTOP_VIEW_MODE_KEY)));
    } catch {
      // Storage can throw in private mode or when cookies are blocked;
      // the default is already in state, so there is nothing to recover.
    }
  }, []);

  const changeMode = useCallback((next: DesktopViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(DESKTOP_VIEW_MODE_KEY, next);
    } catch {
      // Preference simply will not persist; the session still works.
    }
  }, []);

  return { mode, setMode: changeMode };
}
