"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import '../../styles/sheet.css';
import './RecentActivity.css';

/**
 * Recent activity, on the shared sheet.
 *
 * This screen used to render a hardcoded array: ten invented events, invented
 * wallets, an invented "DexterAdmin" claiming invented payouts, with no fetch
 * anywhere in the file. Not a fallback for when data was missing, which is what
 * the leaderboard had, but the only thing it ever showed, to everyone.
 *
 * /api/activity already existed and already built this feed out of real
 * predictions and stakes in Redis. It is simply wired up now.
 *
 * The figures are V2-era and denominated in ETH, because that is what the
 * settled markets in Redis are. The screen says so rather than implying these
 * are live V3 events.
 */

interface ActivityItem {
  id: string;
  type:
    | 'prediction_created'
    | 'bet_placed'
    | 'prediction_resolved'
    | 'payout_claimed'
    | 'prediction_approved'
    | 'user_joined';
  timestamp: number;
  user: {
    address: string;
    displayName: string;
    avatar?: string;
  };
  prediction?: {
    id: string | number;
    question: string;
    category: string;
  };
  details?: {
    amount?: number;
    choice?: 'YES' | 'NO';
    outcome?: 'YES' | 'NO';
    payout?: number;
    stake?: number;
  };
  isCurrentUser?: boolean;
}

type Filter = 'all' | 'me' | 'predictions' | 'bets';
type TimeRange = '1h' | '24h' | '7d' | '30d';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'me', label: 'Mine' },
  { key: 'predictions', label: 'Markets' },
  { key: 'bets', label: 'Bets' },
];

const RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

/** Which accent the row's marker takes. */
const MARK: Record<ActivityItem['type'], string> = {
  prediction_created: 'created',
  bet_placed: 'bet',
  prediction_resolved: 'resolved',
  payout_claimed: 'payout',
  prediction_approved: 'approved',
  user_joined: 'created',
};

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function RecentActivity() {
  const { address } = useAccount();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 'me' has no server-side equivalent, so it fetches everything and
        // narrows below. The other two map straight onto the API's own filter.
        const type = filter === 'predictions' || filter === 'bets' ? filter : 'all';
        const response = await fetch(`/api/activity?limit=50&type=${type}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (cancelled) return;

        if (!result.success) throw new Error(result.error || 'Failed to load activity');
        setActivities(result.data ?? []);
      } catch (err) {
        if (cancelled) return;
        console.error('❌ Failed to load activity:', err);
        setError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const shown = useMemo(() => {
    const cutoff = Date.now() - (RANGES.find(r => r.key === timeRange)?.ms ?? 0);
    return activities
      .map(a => ({
        ...a,
        isCurrentUser: !!address && a.user.address.toLowerCase() === address.toLowerCase(),
      }))
      .filter(a => a.timestamp >= cutoff)
      .filter(a => (filter === 'me' ? a.isCurrentUser : true));
  }, [activities, address, filter, timeRange]);

  const betCount = shown.filter(a => a.type === 'bet_placed').length;
  const marketCount = shown.filter(a => a.type === 'prediction_created').length;
  const payouts = shown
    .filter(a => a.details?.payout)
    .reduce((sum, a) => sum + (a.details?.payout || 0), 0);

  const describe = (a: ActivityItem) => {
    const who = a.isCurrentUser ? 'You' : a.user.displayName;
    const actor = <span className="ra-actor">{who}</span>;

    switch (a.type) {
      case 'prediction_created':
        return <>{actor} opened a market</>;
      case 'bet_placed':
        return (
          <>
            {actor} backed{' '}
            <span className={`ra-side ra-side--${a.details?.choice === 'YES' ? 'yes' : 'no'}`}>
              {a.details?.choice ?? '—'}
            </span>
            {a.details?.amount ? (
              <>
                {' '}with <span className="ra-amount">{a.details.amount} ETH</span>
              </>
            ) : null}
          </>
        );
      case 'prediction_resolved':
        return (
          <>
            {actor} settled it{' '}
            <span className={`ra-side ra-side--${a.details?.outcome === 'YES' ? 'yes' : 'no'}`}>
              {a.details?.outcome ?? '—'}
            </span>
          </>
        );
      case 'payout_claimed':
        return (
          <>
            {actor} claimed{' '}
            <span className="ra-amount">{(a.details?.payout ?? 0).toFixed(4)} ETH</span>
          </>
        );
      case 'prediction_approved':
        return <>{actor} approved a market</>;
      case 'user_joined':
        return <>{actor} joined Swipe</>;
      default:
        return <>{actor} did something</>;
    }
  };

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Activity</p>
              <h1 className="sheet-hero-title">
                What just <em>happened</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Markets opened, bets taken, outcomes settled and payouts claimed,
            newest first. Everything here is from the V2 era and denominated in
            ETH; V3 has nothing settled yet, so nothing from it appears.
          </p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Feed</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading the feed</strong>
            Building events from settled markets and stakes.
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Feed</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load the feed</strong>
            {error}
          </div>
        </div>
      </section>
    );
  }

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Feed</p>
          <p className="sheet-rail-meta">
            {`${shown.length} event${shown.length === 1 ? '' : 's'}\nin the last ${timeRange}`}
          </p>
        </div>
        <div>
          <div className="ra-controls">
            <div className="ra-control-group">
              <span className="ra-control-label" id="ra-filter-label">Show</span>
              <div className="sheet-segment" role="group" aria-labelledby="ra-filter-label">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    className="sheet-segment-item"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ra-control-group">
              <span className="ra-control-label" id="ra-range-label">Within</span>
              <div className="sheet-segment" role="group" aria-labelledby="ra-range-label">
                {RANGES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    className="sheet-segment-item"
                    aria-pressed={timeRange === r.key}
                    onClick={() => setTimeRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing in this window</strong>
              {filter === 'me'
                ? 'None of your own activity landed here. Widen the window, or switch back to everything.'
                : 'Widen the window, or come back after the next market settles.'}
            </div>
          ) : (
            <div className="ra-feed">
              {shown.map(a => (
                <div
                  key={a.id}
                  className={`ra-item ra-item--${MARK[a.type]}${a.isCurrentUser ? ' ra-item--you' : ''}`}
                >
                  <span className="ra-mark" aria-hidden="true" />

                  <div className="ra-body">
                    <div className="ra-text">
                      {describe(a)}
                      {a.isCurrentUser && <span className="ra-you-badge">You</span>}
                    </div>

                    {a.prediction && (
                      <div className="ra-market">
                        <span className="ra-category">{a.prediction.category}</span>
                        <span className="ra-question" title={a.prediction.question}>
                          {a.prediction.question}
                        </span>
                      </div>
                    )}
                  </div>

                  <span className="ra-time">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">In this window</p>
          <p className="sheet-rail-meta">{`Last ${timeRange}`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Events</span>
                <span className="sheet-settle-val">{shown.length}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Bets placed</span>
                <span className="sheet-settle-val">{betCount}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Markets opened</span>
                <span className="sheet-settle-val">{marketCount}</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Payouts claimed</span>
                <span className="sheet-settle-val">{payouts.toFixed(4)} ETH</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
