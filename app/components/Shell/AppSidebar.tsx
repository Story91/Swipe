'use client';

import React from 'react';
import {
  Activity,
  BarChart3,
  Coins,
  Gift,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Plus,
  Settings,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  CRUMB,
  GROUP_LABEL,
  GROUP_ORDER,
  NAV_ITEMS,
  activeRowId,
  type DashboardType,
  type NavGroup,
  type NavIconName,
} from './navItems';
import './appshell.css';

/**
 * The desktop sidebar.
 *
 * Holds no state. Every row is a state change in page.tsx, which is why they
 * are buttons and not anchors: there is no route behind any of them. `title` is
 * on every row so the collapsed rail still says what its icons are.
 */

const ICONS: Record<NavIconName, LucideIcon> = {
  markets: LayoutGrid,
  dashboard: LayoutDashboard,
  leaderboard: Trophy,
  stats: BarChart3,
  token: Coins,
  tasks: Gift,
  create: Plus,
  howToPlay: PlayCircle,
  activity: Activity,
  help: HelpCircle,
  admin: Settings,
};

export interface AppSidebarProps {
  active: DashboardType;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (dashboard: DashboardType) => void;
  onCreate: () => void;
  onHowToPlay: () => void;
  claimCount: number;
  isAdmin: boolean;
}

export function AppSidebar({
  active,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCreate,
  onHowToPlay,
  claimCount,
  isAdmin,
}: AppSidebarProps) {
  const currentRow = activeRowId(active);

  const rowsIn = (group: NavGroup) =>
    NAV_ITEMS.filter((item) => item.group === group && (!item.adminOnly || isAdmin));

  return (
    <aside className="appnav" aria-label="Main navigation">
      <div className="appnav__brand">
        <span className="appnav__mark" aria-hidden="true">
          S
        </span>
        <span className="appnav__wordmark">Swipe</span>
        <button
          type="button"
          className="appnav__collapse"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {GROUP_ORDER.map((group) => {
        const rows = rowsIn(group);
        if (rows.length === 0) return null;
        const label = GROUP_LABEL[group];

        return (
          <React.Fragment key={group}>
            {label && <p className="appnav__section">{label}</p>}
            <nav
              className={`appnav__group${group === 'utility' ? ' appnav__group--utility' : ''}`}
              aria-label={label ?? (group === 'utility' ? 'Support' : 'Markets')}
            >
              {rows.map((item) => {
                const Icon = ICONS[item.icon];
                const isCurrent = currentRow !== null && currentRow === item.id;
                const showBadge = Boolean(item.badge) && claimCount > 0;
                const label = item.label;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`appnav__row${isCurrent ? ' appnav__row--active' : ''}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    title={label}
                    onClick={() => {
                      if (item.action.kind === 'create') return onCreate();
                      if (item.action.kind === 'howToPlay') return onHowToPlay();
                      return onSelect(item.action.dashboard);
                    }}
                  >
                    <span className="appnav__icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="appnav__label">{label}</span>
                    {showBadge && (
                      <span className="appnav__badge">
                        {claimCount > 9 ? '9+' : claimCount}
                        <span className="appnav__badge-sr"> ready to claim</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            {group === 'rewards' && <span className="appnav__spacer" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </aside>
  );
}

/**
 * The bar above the content column. Breadcrumb on the left, the controls that
 * were in the horizontal menubar on the right.
 *
 * It carries its own opaque face rather than being transparent like the design
 * reference's, because underneath it is the brand lime and the wallet button is
 * lime-on-near-black. Lime text on a lime ground is the bug this repo keeps
 * shipping.
 */
export function AppBar({
  active,
  children,
}: {
  active: DashboardType;
  children: React.ReactNode;
}) {
  const [section, page] = CRUMB[active].crumb;

  return (
    <header className="appbar">
      <nav className="appbar__crumb" aria-label="Breadcrumb">
        <ol>
          <li>{section}</li>
          <li aria-current="page">{page}</li>
        </ol>
      </nav>
      <div className="appbar__right">{children}</div>
    </header>
  );
}

export default AppSidebar;
