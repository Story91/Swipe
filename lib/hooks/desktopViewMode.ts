'use client';

import { useCallback, useState } from 'react';

/**
 * Desktop-only view mode - retired to a single mode, on the user's direction.
 *
 * There used to be two: `grid` and `swipe`, with a toggle in the top bar and
 * the preference in localStorage. The swipe layout on a wide screen was judged
 * to look wrong ("źle wygląda strasznie ten tryb swipe w wersji desktop"), and
 * once the market detail page gained a real bet panel there was nothing swipe
 * mode could do on desktop that the grid and the detail page cannot. Desktop
 * is grid, full stop.
 *
 * The shape of the hook survives so its consumers compile and behave without
 * edits - app/page.tsx is concurrently being edited by another session, and
 * this file is the one place the mode is decided. `setMode` is deliberately
 * inert: the one caller that used to switch to 'swipe' (the ?prediction= deep
 * link handler) now simply lands on the grid, which shows the market it was
 * seeking. Stored preferences are neither read nor written, so a visitor who
 * once chose 'swipe' is not resurrected into a retired layout.
 *
 * Mobile never read this hook; below the desktop breakpoint the app stays on
 * the swipe deck, which is the product. Deleting the type and the hook wants
 * an edit to page.tsx, and belongs to the day that file is free.
 */
export type DesktopViewMode = 'grid' | 'swipe';

export const DESKTOP_VIEW_MODE_KEY = 'swipe:desktop-view-mode';
export const DEFAULT_DESKTOP_VIEW_MODE: DesktopViewMode = 'grid';

/** Narrows an untrusted stored value; anything unexpected falls back to the default. */
export function parseViewMode(value: string | null | undefined): DesktopViewMode {
  return value === 'grid' || value === 'swipe' ? value : DEFAULT_DESKTOP_VIEW_MODE;
}

export function useDesktopViewMode() {
  const [mode] = useState<DesktopViewMode>('grid');

  const changeMode = useCallback((_next: DesktopViewMode) => {
    // Inert on purpose; see the header comment.
  }, []);

  return { mode, setMode: changeMode };
}
