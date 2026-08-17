"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains/types';
import { tokenSymbol, COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';
import { collateralPayouts, eraSplit } from './boardTotals';
import '../../styles/sheet.css';
import './RecentActivity.css';

/**
 * Recent activity, on the shared sheet (app/styles/sheet.css).
 *
 * Sheet language rather than the lime card face of MarketPools or the #0d0d0d
 * panel of MarketChooserModal, for the same reason the other dashboard screens
 * use it: this is a full panel with its own hero, not something sitting on the
 * swipe card and not a dialog floating over the app.
 *
 * WHAT THIS FILE USED TO BE
 *
 * A hardcoded array. Ten invented events, invented wallets, an invented
 * "DexterAdmin" claiming invented payouts, with no fetch anywhere in the file.
 * Not a fallback for when data was missing, which is what the leaderboard had,
 * but the only thing it ever showed, to everyone. /api/activity already existed
 * and already built this feed out of real predictions and stakes in Redis.
 *
 * WHAT IS STILL NOT EXACT, AND IS MARKED
 *
 * Two of the six row types carry a time the route derives rather than reads.
 * Nothing in Redis records when a market was settled or when a payout was
 * pulled, so /api/activity places them one second and one hour after the
 * deadline. That is a placement, not a measurement, and a row built that way is
 * marked with a tilde instead of being presented as an exact time. Bets and new
 * markets carry the moment they actually happened.
 *
 * The route also fills a `user.avatar` field from a random pick out of twelve
 * emoji, which changes on every request. Nothing here reads it.
 *
 * TOKENS
 *
 * Each row carries the token it happened in, so a bet is one row per token and
 * the figure beside it is labelled from the data. The markup used to print ETH
 * next to every number, which on a collateral market named the wrong token and
 * printed a raw six decimal integer beside it. Amounts arrive in readable units
 * already, so nothing here divides again.
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
    /** What amount and payout are in. The feed printed ETH beside all three. */
    token?: StakeToken;
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

/**
 * Which accent the row's marker takes.
 *
 * Whole class names rather than the accent word alone, so each one appears in
 * this file as text. `ra-item--${accent}` reached the same five rules, but only
 * the dead-CSS scan's interpolation heuristic kept them off the delete list, and
 * that heuristic depends on backtick pairing across every file in the app. Four
 * of the five were on the list anyway. A literal is not clever and cannot drift.
 */
const MARK: Record<ActivityItem['type'], string> = {
  prediction_created: 'ra-item--created',
  bet_placed: 'ra-item--bet',
  prediction_resolved: 'ra-item--resolved',
  payout_claimed: 'ra-item--payout',
  prediction_approved: 'ra-item--approved',
  user_joined: 'ra-item--created',
};

/** Row types whose timestamp the route derives from the deadline. */
const DERIVED_TIME = new Set<ActivityItem['type']>(['prediction_resolved', 'payout_claimed']);

const PREDICTION_TYPES = new Set<ActivityItem['type']>([
  'prediction_created',
  'prediction_resolved',
  'prediction_approved',
]);

const BET_TYPES = new Set<ActivityItem['type']>(['bet_placed', 'payout_claimed']);

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

/** What the feed currently holds, and the chain it answers for. */
interface Loaded {
  chain: ChainKey;
  items: ActivityItem[];
}

export function RecentActivity() {
  // The active chain travels with every read below. The server defaults to Base
  // when no chain is sent, which is right for Base and wrong for every other
  // chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey, chain } = useActiveChain();
  const { address } = useAccount();

  // The collateral leg is stored under the key 'USDC' on every chain, so the
  // symbol comes from the chain. Otherwise a Robinhood feed announces bets in
  // the wrong stablecoin.
  const symbolFor = (token: StakeToken | undefined) =>
    tokenSymbol(token ?? COLLATERAL_LEG, chainKey);
  const stable = tokenSymbol(COLLATERAL_LEG, chainKey);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [error, setError] = useState<string | null>(null);

  const ticketRef = useRef(0);

  useEffect(() => {
    const ticket = ++ticketRef.current;
    const current = () => ticket === ticketRef.current;

    const load = async () => {
      // No loading flag. Events that do not belong to the current chain are
      // already the state "still waiting", and a second variable saying the
      // same thing can only disagree with the first.
      setError(null);
      try {
        // Always type=all. The route sorts by time, slices to `limit`, and only
        // then applies its type filter, so asking it for bets returns the bets
        // inside the newest fifty events rather than the newest fifty bets. The
        // filter is a view of what is already here, so it belongs on this side
        // and it costs no round trip.
        const response = await fetch(`/api/activity?limit=50&type=all&chain=${chainKey}`);
        if (!response.ok) throw new Error(`the server answered ${response.status}`);

        const result = await response.json();
        if (!current()) return;
        if (!result.success) throw new Error(result.error || 'the feed could not be built');
        setLoaded({ chain: chainKey, items: (result.data ?? []) as ActivityItem[] });
      } catch (err) {
        if (!current()) return;
        // Deliberately does not clear `loaded`. Replacing a good feed with an
        // empty list on a failed fetch is a bug this repo has shipped twice.
        console.error('Failed to load activity:', err);
        setError(err instanceof Error ? err.message : 'the request failed');
      }
    };

    load();
    // chainKey only. The filter no longer decides the request, so switching it
    // does not go back to the network, and the chain is the one thing that
    // changes which events exist at all.
  }, [chainKey]);

  // Events count as this screen's answer only while they answer for this chain.
  const activities = loaded && loaded.chain === chainKey ? loaded.items : null;

  const shown = useMemo(() => {
    if (!activities) return [];
    const cutoff = Date.now() - (RANGES.find((r) => r.key === timeRange)?.ms ?? 0);
    return activities
      .map((a) => ({
        ...a,
        isCurrentUser: !!address && a.user.address.toLowerCase() === address.toLowerCase(),
      }))
      .filter((a) => a.timestamp >= cutoff)
      .filter((a) => {
        if (filter === 'me') return a.isCurrentUser;
        if (filter === 'predictions') return PREDICTION_TYPES.has(a.type);
        if (filter === 'bets') return BET_TYPES.has(a.type);
        return true;
      });
  }, [activities, address, filter, timeRange]);

  const betCount = shown.filter((a) => a.type === 'bet_placed').length;
  const marketCount = shown.filter((a) => a.type === 'prediction_created').length;

  // Which era the rows in view came from, counted rather than asserted. The
  // screen used to state in its lede that most of the feed was old ETH markets,
  // which was a guess about data the component was already holding.
  const { archived: archivedRows, collateral: collateralRows } = eraSplit(shown);

  // Collateral payouts only. Adding an ETH payout to a stablecoin one gives a
  // number in no currency at all, and the row beneath it has to print some
  // symbol, so it would be labelled wrong whichever one it picked.
  const { count: payoutCount, total: payouts } = collateralPayouts(shown);

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
            <span
              className={
                a.details?.choice === 'YES' ? 'ra-side ra-side--yes' : 'ra-side ra-side--no'
              }
            >
              {a.details?.choice ?? 'a side'}
            </span>
            {a.details?.amount ? (
              <>
                {' '}
                with{' '}
                <span className="ra-amount">
                  {a.details.amount.toFixed(4)} {symbolFor(a.details.token)}
                </span>
              </>
            ) : null}
          </>
        );
      case 'prediction_resolved':
        return (
          <>
            {actor} settled it{' '}
            <span
              className={
                a.details?.outcome === 'YES' ? 'ra-side ra-side--yes' : 'ra-side ra-side--no'
              }
            >
              {a.details?.outcome ?? 'one way'}
            </span>
          </>
        );
      case 'payout_claimed':
        return (
          <>
            {actor} claimed{' '}
            <span className="ra-amount">
              {(a.details?.payout ?? 0).toFixed(4)} {symbolFor(a.details?.token)}
            </span>
          </>
        );
      case 'prediction_approved':
        return <>{actor} approved a market</>;
      case 'user_joined':
        return <>{actor} joined Swipe</>;
      default:
        return <>{actor} did something this feed has no wording for</>;
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
            Markets opened, bets taken, outcomes settled and payouts claimed, newest
            first. Every line says which token it was in, and anything in ETH or SWIPE is
            tagged, because those sit on the old contracts and nothing new lands there.
          </p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  // No events and no error behind it means the answer is still coming. This is
  // why there is no separate loading flag. An effect runs after the commit, so
  // the render that changes chain paints once with no events and any such flag
  // still false, which is exactly the moment a flag-driven branch would say
  // "nothing came back" about a request that had not been made.
  if (activities === null && error === null) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Feed</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading the feed</strong>
            Building events from markets and stakes on {chain.label}.
          </div>
        </div>
      </section>
    );
  }

  if (activities === null) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Feed</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load the feed</strong>
            Nothing came back, because {error ?? 'the request failed'}. No events are
            being shown in place of the real ones.
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
                {FILTERS.map((f) => (
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
                {RANGES.map((r) => (
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

          {/* A failed refresh is a banner over a feed that is still the last
              true answer, not a replacement for it. */}
          {error && (
            <p className="ra-banner">
              The last refresh failed, because {error}. These events are from the previous
              successful read.
            </p>
          )}

          {shown.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing in this window</strong>
              {filter === 'me'
                ? 'None of your own activity landed here. Widen the window, or switch back to everything.'
                : 'Widen the window, or come back after the next bet lands.'}
            </div>
          ) : (
            <div className="ra-feed">
              {shown.map((a) => {
                const token = a.details?.token;
                const archived = token === 'ETH' || token === 'SWIPE';
                const approximate = DERIVED_TIME.has(a.type);

                return (
                  <div
                    key={a.id}
                    className={`ra-item ${MARK[a.type]}${a.isCurrentUser ? ' ra-item--you' : ''}`}
                  >
                    <span className="ra-mark" aria-hidden="true" />

                    <div className="ra-body">
                      <div className="ra-text">
                        {describe(a)}
                        {archived && (
                          <span className="ra-archived" title="On the old contracts">
                            old contracts
                          </span>
                        )}
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

                    {approximate ? (
                      <span
                        className="ra-time ra-approx"
                        title="No exact time is recorded for this, so it is placed just after the market's deadline"
                      >
                        ~{timeAgo(a.timestamp)}
                      </span>
                    ) : (
                      <span className="ra-time">{timeAgo(a.timestamp)}</span>
                    )}
                  </div>
                );
              })}
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
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Rows on the old contracts</span>
                <span className="sheet-settle-val">
                  {archivedRows} of {archivedRows + collateralRows}
                </span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Claimed in {stable}</span>
                <span className="sheet-settle-val">
                  {payoutCount === 0 ? 'none yet' : `${payouts.toFixed(4)} ${stable}`}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              The claimed figure counts {stable} only. An ETH payout and a stablecoin one
              are amounts of different things, and a single number covering both would
              have to print one symbol next to a sum that is not in it.
            </p>
            <p>
              A time with a tilde in front of it is placed rather than measured. Nothing
              records when a market was settled or when somebody pulled a payout, so those
              two kinds of row sit just after the deadline and may be well out of order
              against the bets around them.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
