'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Whether the desktop sidebar is showing icons only.
 *
 * Same shape as lib/hooks/desktopViewMode.ts, and for the same reason: the
 * stored value is read in an effect after mount rather than during render, so
 * server and first client render agree. Reading localStorage during render is
 * how this app got a hydration mismatch once already.
 *
 * It lives next to the sidebar rather than in lib/hooks because it is state for
 * one component and nothing else reads it.
 */
export const SIDEBAR_COLLAPSED_KEY = 'swipe:sidebar-collapsed';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    } catch {
      // Storage throws in private mode or with cookies blocked. Expanded is
      // already in state and is the safe default, so there is nothing to do.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // The preference will not survive a reload; the session still works.
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
