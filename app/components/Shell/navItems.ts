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
  'my-portfolio',
  'active-bets',
  'bet-history',
  'help-faq',
  'leaderboard',
  'recent-activity',
  'swipe-token',
  'claim',
  'daily-tasks',
  // 'usdc-markets' is gone, not excluded: the separate stable-collateral list
  // merged into the markets grid, which now carries each tile's network and
  // collateral identity itself. The component behind it (SwipeMarkets) was
  // deleted, so keeping the id would name a dashboard nothing can render.
] as const;

export type DashboardType = (typeof DASHBOARDS)[number];

/**
 * Dashboards with no row of their own, and the honest reason for each.
 *
 * Every reason in here used to be false. "A tab inside AdminPanel" described a
 * component that is 64 lines long and contains no navigation. "A tab inside the
 * dashboard" described EnhancedUserDashboard, which is mounted with no props
 * and so has no callback that could change the parent's screen. "Only reachable
 * by deep link" described a mechanism that does not exist: four call sites
 * write ?dashboard=, and app/page.tsx reads one query key, which is ?prediction.
 *
 * So seven screens shipped with no way in, and my-portfolio was the expensive
 * one: it is the only mount of the refunds and creator reward panels, which are
 * the only routes in the app to money the contract is already holding. It has a
 * row now.
 *
 * The rest stay out because they are genuinely superseded, not because they are
 * reachable somewhere else. A screen listed here renders nowhere, and the test
 * beside this file checks that the claim in each string is true rather than
 * accepting the string.
 */
export const NOT_IN_SIDEBAR: Record<string, string> = {
  approver: 'Superseded. AdminDashboard renders the proposal queue inline.',
  'active-bets': 'Superseded by the Portfolio row, which has an open tab.',
  'bet-history': 'Superseded by the Portfolio row, which has a history tab.',
  claim: 'The $SWIPE rewards contracts are archived and their key is gone.',
};

export type NavIconName =
  | 'markets'
  | 'dashboard'
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
  // The per-token ledger, plus the two panels that are the app's only route to
  // a creator fee and to a refund on an abandoned market. Both are money the
  // contract is holding, and until this row existed neither had a button.
  { id: 'portfolio', label: 'Portfolio', icon: 'dashboard', group: 'main', action: { kind: 'dashboard', dashboard: 'my-portfolio' } },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard', group: 'main', action: { kind: 'dashboard', dashboard: 'leaderboard' } },
  { id: 'stats', label: 'Stats', icon: 'stats', group: 'main', action: { kind: 'dashboard', dashboard: 'market-stats' } },

  { id: 'token', label: '$SWIPE', icon: 'token', group: 'rewards', action: { kind: 'dashboard', dashboard: 'swipe-token' } },
  { id: 'tasks', label: 'Daily tasks', icon: 'tasks', group: 'rewards', action: { kind: 'dashboard', dashboard: 'daily-tasks' } },

  { id: 'create', label: 'Create market', icon: 'create', group: 'utility', action: { kind: 'create' } },
  { id: 'howToPlay', label: 'How to play', icon: 'howToPlay', group: 'utility', action: { kind: 'howToPlay' } },
  { id: 'activity', label: 'Activity', icon: 'activity', group: 'utility', action: { kind: 'dashboard', dashboard: 'recent-activity' } },
  { id: 'help', label: 'Help and FAQ', icon: 'help', group: 'utility', action: { kind: 'dashboard', dashboard: 'help-faq' } },
  { id: 'admin', label: 'Admin', icon: 'admin', group: 'utility', action: { kind: 'dashboard', dashboard: 'admin' }, adminOnly: true },
  // Both of these work and neither had a way in. Analytics reads the collateral
  // pools per chain, and settings is a read-only ledger of what the contract
  // says, which is the one screen that answers "what rate is actually live".
  { id: 'analytics', label: 'Analytics', icon: 'stats', group: 'utility', action: { kind: 'dashboard', dashboard: 'analytics' }, adminOnly: true },
  { id: 'settings', label: 'Contract settings', icon: 'admin', group: 'utility', action: { kind: 'dashboard', dashboard: 'settings' }, adminOnly: true },
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
  'my-portfolio': { crumb: ['You', 'Portfolio'], title: 'Your portfolio' },
  'active-bets': { crumb: ['You', 'Open bets'], title: 'Open bets' },
  'bet-history': { crumb: ['You', 'History'], title: 'Bet history' },
  'help-faq': { crumb: ['Support', 'Help'], title: 'Help and FAQ' },
  leaderboard: { crumb: ['Markets', 'Leaderboard'], title: 'Leaderboard' },
  'recent-activity': { crumb: ['Markets', 'Activity'], title: 'Recent activity' },
  'swipe-token': { crumb: ['Rewards', '$SWIPE'], title: '$SWIPE' },
  claim: { crumb: ['Rewards', 'Claim'], title: 'Claim' },
  'daily-tasks': { crumb: ['Rewards', 'Tasks'], title: 'Daily tasks' },
};

/** Which sidebar row should read as current for a given dashboard. */
export function activeRowId(dashboard: DashboardType): string | null {
  const match = NAV_ITEMS.find(
    (item) => item.action.kind === 'dashboard' && item.action.dashboard === dashboard
  );
  return match ? match.id : null;
}
