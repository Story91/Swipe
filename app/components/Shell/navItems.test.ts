import { describe, it, expect } from 'vitest';
import {
  DASHBOARDS,
  NAV_ITEMS,
  NOT_IN_SIDEBAR,
  CRUMB,
  GROUP_ORDER,
  activeRowId,
} from './navItems';

/**
 * Hiding the horizontal menubar on desktop left the sidebar as the only way
 * into most of the app. A dashboard that is neither on a row nor on the
 * documented exclusion list is a shipped feature nobody can reach, and nothing
 * about that throws or fails to compile.
 *
 * Checked by breaking it: deleting the Markets row from NAV_ITEMS makes the
 * first test fail with `expected [] to include 'tinder'`, and deleting the
 * `tinder` entry from CRUMB makes the third fail. Both were confirmed red
 * before this file was trusted.
 */
describe('sidebar coverage', () => {
  const reachable = NAV_ITEMS.flatMap((item) =>
    item.action.kind === 'dashboard' ? [item.action.dashboard as string] : []
  );

  it('puts every dashboard on a row or on the exclusion list', () => {
    const unreachable = DASHBOARDS.filter(
      (d) => !reachable.includes(d) && !(d in NOT_IN_SIDEBAR)
    );
    expect(unreachable).toEqual([]);
  });

  it('does not exclude something it also links to', () => {
    const both = Object.keys(NOT_IN_SIDEBAR).filter((d) => reachable.includes(d));
    expect(both).toEqual([]);
  });

  it('names every dashboard in the breadcrumb table', () => {
    const missing = DASHBOARDS.filter((d) => !(d in CRUMB));
    expect(missing).toEqual([]);
  });

  it('gives every row a group the sidebar renders', () => {
    const orphans = NAV_ITEMS.filter((item) => !GROUP_ORDER.includes(item.group));
    expect(orphans).toEqual([]);
  });

  it('uses each row id once', () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks the row that matches the open dashboard', () => {
    expect(activeRowId('tinder')).toBe('markets');
    expect(activeRowId('usdc-markets')).toBe('usdc');
    // Reached from inside the dashboard, so no row lights up.
    expect(activeRowId('bet-history')).toBeNull();
  });
});
