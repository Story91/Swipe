'use client';

import { useEffect, useState } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';

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

export interface ActivityItem {
  id: string;
  type: string;
  timestamp: number;
  user?: { address?: string; displayName?: string; avatar?: string };
  prediction?: { id?: string; question?: string };
}

interface PanelData {
  stats: MarketStats | null;
  activity: ActivityItem[];
  claimCount: number | null;
  loading: boolean;
}

export function useProductPanelData(address?: string): PanelData {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [claimCount, setClaimCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Both are independent; one failing must not blank the other.
      const [statsRes, activityRes] = await Promise.allSettled([
        fetch(`/api/market/compact-stats?chain=${chainKey}`).then((r) => r.json()),
        fetch(`/api/activity?chain=${chainKey}`).then((r) => r.json()),
      ]);

      if (cancelled) return;

      if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
        setStats(statsRes.value.data ?? null);
      }
      if (activityRes.status === 'fulfilled' && activityRes.value?.success) {
        setActivity(Array.isArray(activityRes.value.data) ? activityRes.value.data : []);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setClaimCount(null);
      return;
    }
    let cancelled = false;

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
  }, [address]);

  return { stats, activity, claimCount, loading };
}
