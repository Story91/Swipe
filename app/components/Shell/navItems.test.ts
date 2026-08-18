import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
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
    // 'usdc-markets' used to be asserted here; the dashboard merged into the
    // markets grid and its id left the union, so the second positive case is
    // now the leaderboard row.
    expect(activeRowId('leaderboard')).toBe('leaderboard');
    // Reached from inside the dashboard, so no row lights up.
    expect(activeRowId('bet-history')).toBeNull();
  });
});

/**
 * An excluded dashboard must not still be rendered.
 *
 * The check above accepts a dashboard that is on a row OR on the exclusion
 * list, and never looks at whether the excuse in the string is true. Seven
 * screens shipped behind it with no way in, each with a reason that read fine
 * and described something that does not exist: "a tab inside AdminPanel" for a
 * 64 line component with no navigation, "reachable by deep link" for a
 * mechanism where four call sites write ?dashboard= and nothing reads it.
 *
 * The costly one was my-portfolio. It is the only mount of the refunds and
 * creator reward panels, so the only routes in the app to money the contract is
 * already holding sat behind a screen nothing could open, while the Help and
 * FAQ told people to go there.
 *
 * So this reads app/page.tsx and pairs the two facts the other test keeps
 * apart: a dashboard that page.tsx renders has to be one the nav can reach.
 */
describe('an excluded dashboard is not still mounted', () => {
  const pageSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'page.tsx'),
    'utf8'
  );

  /** Which dashboards app/page.tsx actually renders. */
  const mounted = DASHBOARDS.filter((d) =>
    pageSource.includes(`activeDashboard === '${d}'`)
  );

  it('finds the mounts, so a green run means something', () => {
    expect(mounted.length).toBeGreaterThan(5);
  });

  it('renders nothing the nav cannot open', () => {
    const reachable = NAV_ITEMS.flatMap((item) =>
      item.action.kind === 'dashboard' ? [item.action.dashboard as string] : []
    );
    // 'tinder' is the initial state rather than a destination, and it is also
    // on a row, so it needs no special case. Anything else that renders must be
    // reachable.
    const orphaned = mounted.filter((d) => !reachable.includes(d));
    expect(
      orphaned,
      `app/page.tsx renders these and nothing can navigate to them:\n${orphaned.join('\n')}`
    ).toEqual([]);
  });
});
