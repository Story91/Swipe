'use client';

import { useEffect, useState } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ActivityItem } from './panelFormat';

export type { ActivityItem } from './panelFormat';

/**
 * Data behind the product panels.
 *
 * Deliberately excludes the leaderboard: /api/leaderboard returns nothing for
 * its default 30-day window (there has been no recent activity) and the
 * all-time variant scans every user in Redis and times out. Putting it in a
 * surface that loads on every page view would make the page slow to show
 * nothing. It belongs behind an explicit navigation instead.
 */

export interface MarketStats {
  totalPredictions: number;
  activePredictions: number;
  totalParticipants: number;
  totalVolumeETH: number;
  successRate: number;
  topCategory: string;
}

/**
 * The live half of /api/market/compact-stats, split out from the archive.
 *
 * See app/components/Panels/marketCensus.ts for why none of the cached figures
 * could be printed on their own.
 */
export interface MarketCensusView {
  open: number;
  markets: number;
  awaiting: number;
  archived: number;
  players: number;
  /** Raw, six decimals. Convert with toDisplayUnits(pooledRaw, COLLATERAL_LEG). */
  pooledRaw: number;
  archivedPooledRaw: number;
  /** What the chain calls its collateral. USDC on Base, USDG on Robinhood. */
  symbol: string;
  decimals: number;
}

interface PanelData {
  stats: MarketStats | null;
  census: MarketCensusView | null;
  activity: ActivityItem[];
  claimCount: number | null;
  loading: boolean;
  /**
   * A read came back for this chain.
   *
   * Separate from `loading` because the live dot on the panels is a claim about
   * data, not about a spinner. Lit means "these numbers were read from the
   * server just now". A dot that lights up while a request is still in flight,
   * or after one that failed, is decoration pretending to be telemetry.
   */
  statsLive: boolean;
  activityLive: boolean;
}

/** How many feed rows to ask for. The slider needs more than fill one screen. */
const ACTIVITY_LIMIT = 24;

function readCensus(raw: unknown): MarketCensusView | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.symbol !== 'string') return null;
  const num = (key: string) => Number(c[key]) || 0;
  return {
    open: num('open'),
    markets: num('markets'),
    awaiting: num('awaiting'),
    archived: num('archived'),
    players: num('players'),
    pooledRaw: num('pooledRaw'),
    archivedPooledRaw: num('archivedPooledRaw'),
    symbol: c.symbol,
    decimals: Number(c.decimals) || 6,
  };
}

export function useProductPanelData(address?: string): PanelData {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [census, setCensus] = useState<MarketCensusView | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [claimCount, setClaimCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLive, setStatsLive] = useState(false);
  const [activityLive, setActivityLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Back to loading on every run, not just the first, and the previous
      // chain's answers go with it. This effect re-runs when the chain changes,
      // and ProductPanels only draws its skeleton while `loading && !stats`, so
      // leaving the old stats in place would keep Base's numbers on screen
      // under the new chain's name until the request came back.
      setLoading(true);
      setStats(null);
      setCensus(null);
      setActivity([]);
      setStatsLive(false);
      setActivityLive(false);

      // Both are independent; one failing must not blank the other.
      const [statsRes, activityRes] = await Promise.allSettled([
        fetch(`/api/market/compact-stats?chain=${chainKey}`).then((r) => r.json()),
        fetch(`/api/activity?chain=${chainKey}&limit=${ACTIVITY_LIMIT}`).then((r) => r.json()),
      ]);

      if (cancelled) return;

      if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
        setStats(statsRes.value.data ?? null);
        setCensus(readCensus(statsRes.value.data?.census));
        setStatsLive(true);
      }
      if (activityRes.status === 'fulfilled' && activityRes.value?.success) {
        setActivity(Array.isArray(activityRes.value.data) ? activityRes.value.data : []);
        // True even for an empty list. An empty feed that was read is a fact
        // worth stating, and it is what lets the panel show a written empty
        // state rather than skeleton rows that never resolve.
        setActivityLive(true);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [chainKey]);

  useEffect(() => {
    if (!address) {
      setClaimCount(null);
      return;
    }
    let cancelled = false;

    // Back to null while the new chain's count is in flight. This is a count of
    // money waiting to be claimed, so the wrong chain's number is worse than no
    // number, and null is already the state the widget hides on.
    setClaimCount(null);

    fetch(`/api/claims/count?userId=${address}&chain=${chainKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success) setClaimCount(json.count ?? 0);
      })
      .catch(() => {
        // A failed claim count is not worth surfacing; the widget just hides.
      });

    return () => {
      cancelled = true;
    };
  }, [address, chainKey]);

  return { stats, census, activity, claimCount, loading, statsLive, activityLive };
}
