/**
 * The desktop sidebar, as data.
 *
 * Plain data with no React in it, so the coverage test can run in vitest's node
 * environment without a renderer. Icons are named here and resolved to
 * components in AppSidebar.tsx.
 *
 * The point of DASHBOARDS being the exported union rather than a copy of the one
 * in page.tsx: hiding the horizontal menubar on desktop removed the only route
 * to four of these, and a missed row makes a shipped feature unreachable without
 * throwing anything. navItems.test.ts asserts every value is either on a row or
 * on the exclusion list below, and the exclusion list has to say why.
 */

export const DASHBOARDS = [
  'tinder',
  'user',
  'admin',
  'approver',
  'market-stats',
  'analytics',
  'settings',
  'audit-logs',
  'my-portfolio',
  'active-bets',
  'bet-history',
  'help-faq',
  'leaderboard',
  'recent-activity',
  'swipe-token',
  'claim',
  'daily-tasks',
  'usdc-markets',
] as const;

export type DashboardType = (typeof DASHBOARDS)[number];

/**
 * Reached from inside AdminPanel or EnhancedUserDashboard, not from the top
 * nav. None of these were in the horizontal menubar either, so leaving them out
 * of the sidebar loses nothing.
 */
export const NOT_IN_SIDEBAR: Record<string, string> = {
  approver: 'AdminPanel routes to it; the row would say Admin twice.',
  analytics: 'A tab inside AdminPanel.',
  settings: 'A tab inside AdminPanel.',
  'audit-logs': 'A tab inside AdminPanel.',
  'my-portfolio': 'A tab inside the dashboard.',
  'active-bets': 'A tab inside the dashboard.',
  'bet-history': 'A tab inside the dashboard.',
  claim: 'Claims are paused, and the page is only reachable by deep link.',
};

export type NavIconName =
  | 'markets'
  | 'dashboard'
  | 'usdc'
  | 'leaderboard'
  | 'stats'
  | 'token'
  | 'tasks'
  | 'create'
  | 'howToPlay'
  | 'activity'
  | 'help'
  | 'admin';

export type NavAction =
  | { kind: 'dashboard'; dashboard: DashboardType }
  | { kind: 'create' }
  | { kind: 'howToPlay' };

export type NavGroup = 'main' | 'rewards' | 'utility';

export interface NavItem {
  id: string;
  label: string;
  icon: NavIconName;
  group: NavGroup;
  action: NavAction;
  /** Shows the ready-to-claim count. */
  badge?: boolean;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'markets', label: 'Markets', icon: 'markets', group: 'main', action: { kind: 'dashboard', dashboard: 'tinder' } },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'main', action: { kind: 'dashboard', dashboard: 'user' }, badge: true },
  { id: 'usdc', label: 'USDC markets', icon: 'usdc', group: 'main', action: { kind: 'dashboard', dashboard: 'usdc-markets' } },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard', group: 'main', action: { kind: 'dashboard', dashboard: 'leaderboard' } },
  { id: 'stats', label: 'Stats', icon: 'stats', group: 'main', action: { kind: 'dashboard', dashboard: 'market-stats' } },

  { id: 'token', label: '$SWIPE', icon: 'token', group: 'rewards', action: { kind: 'dashboard', dashboard: 'swipe-token' } },
  { id: 'tasks', label: 'Daily tasks', icon: 'tasks', group: 'rewards', action: { kind: 'dashboard', dashboard: 'daily-tasks' } },

  { id: 'create', label: 'Create market', icon: 'create', group: 'utility', action: { kind: 'create' } },
  { id: 'howToPlay', label: 'How to play', icon: 'howToPlay', group: 'utility', action: { kind: 'howToPlay' } },
  { id: 'activity', label: 'Activity', icon: 'activity', group: 'utility', action: { kind: 'dashboard', dashboard: 'recent-activity' } },
  { id: 'help', label: 'Help and FAQ', icon: 'help', group: 'utility', action: { kind: 'dashboard', dashboard: 'help-faq' } },
  { id: 'admin', label: 'Admin', icon: 'admin', group: 'utility', action: { kind: 'dashboard', dashboard: 'admin' }, adminOnly: true },
];

export const GROUP_LABEL: Record<NavGroup, string | null> = {
  main: null,
  rewards: 'Rewards',
  utility: null,
};

export const GROUP_ORDER: NavGroup[] = ['main', 'rewards', 'utility'];

/**
 * What the top bar says you are looking at, and what the page calls itself.
 *
 * The second crumb segment is the dashboard's own name, not the market status
 * filter. That filter is owned by MarketGrid and lifting it up here to buy one
 * word of breadcrumb would be a state refactor for a word.
 */
export interface CrumbEntry {
  crumb: [string, string];
  title: string;
}

export const CRUMB: Record<DashboardType, CrumbEntry> = {
  tinder: { crumb: ['Markets', 'Browse'], title: 'All markets' },
  user: { crumb: ['You', 'Dashboard'], title: 'Your dashboard' },
  admin: { crumb: ['Admin', 'Panel'], title: 'Admin' },
  approver: { crumb: ['Admin', 'Approvals'], title: 'Approvals' },
  'market-stats': { crumb: ['Markets', 'Stats'], title: 'Market stats' },
  analytics: { crumb: ['Admin', 'Analytics'], title: 'Platform analytics' },
  settings: { crumb: ['Admin', 'Settings'], title: 'System settings' },
  'audit-logs': { crumb: ['Admin', 'Audit log'], title: 'Audit log' },
  'my-portfolio': { crumb: ['You', 'Portfolio'], title: 'Your portfolio' },
  'active-bets': { crumb: ['You', 'Open bets'], title: 'Open bets' },
  'bet-history': { crumb: ['You', 'History'], title: 'Bet history' },
  'help-faq': { crumb: ['Support', 'Help'], title: 'Help and FAQ' },
  leaderboard: { crumb: ['Markets', 'Leaderboard'], title: 'Leaderboard' },
  'recent-activity': { crumb: ['Markets', 'Activity'], title: 'Recent activity' },
  'swipe-token': { crumb: ['Rewards', '$SWIPE'], title: '$SWIPE' },
  claim: { crumb: ['Rewards', 'Claim'], title: 'Claim' },
  'daily-tasks': { crumb: ['Rewards', 'Tasks'], title: 'Daily tasks' },
  'usdc-markets': { crumb: ['Markets', 'USDC'], title: 'USDC markets' },
};

/** Which sidebar row should read as current for a given dashboard. */
export function activeRowId(dashboard: DashboardType): string | null {
  const match = NAV_ITEMS.find(
    (item) => item.action.kind === 'dashboard' && item.action.dashboard === dashboard
  );
  return match ? match.id : null;
}
