"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains/types';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import { LeaderboardNow } from '../Support/Leaderboard';
import {
  archivedUnits,
  isApportioned,
  rankByPool,
  rowStake,
  shownPoolTotal,
} from './leaderboardMath';
import '../../styles/sheet.css';
import './Leaderboard.css';

/**
 * The Leaderboard tab, which is two boards because there are two eras.
 *
 * On the shared sheet (app/styles/sheet.css) rather than the lime card face of
 * MarketPools or the #0d0d0d panel of MarketChooserModal. That follows from
 * where it sits: this is a full dashboard panel with its own hero, the slot
 * Help & FAQ and Recent activity also fill. Lime is for components on the swipe
 * card surface, the dark panel is for dialogs floating above the app.
 *
 * WHAT CHANGED, AND WHY
 *
 * This screen used to be the archived board and nothing else. Everything it
 * showed came from /api/leaderboard/real-data, which serves a cached scan of the
 * old V2 contract: ETH pools and SWIPE pools, on contracts whose owner key is
 * gone. It was labelled as V2 era in the lede, which was honest as far as it
 * went, but a tab called Leaderboard that never mentions the contract currently
 * taking bets tells a reader the wrong thing by omission. The live standings now
 * come first, from Support/Leaderboard, and the archived scan sits underneath
 * with its era on it.
 *
 * The two are never added together. Positions are stored raw, so one ETH is 1e18
 * and one unit of collateral is 1e6; a single cross token total is meaningless
 * and on a ranking it is fatal, because a speck of ETH would outrank every real
 * bet. They are two boards on one page, and they stay that way.
 *
 * UNITS IN THE ARCHIVED CACHE
 *
 * Per user amounts in that cache are raw wei from both jobs that write it. What
 * stood here instead was a guess, `amount > 1e15 ? amount / 1e18 : amount`,
 * justified as telling wei from ether by inspection. It does not: a real
 * position of 0.0005 ETH is 5e14 wei, clears no threshold, and rendered as
 * 500000000000000.0000 ETH. Small V2 positions are exactly the common case, so
 * the guess is gone and the division is unconditional.
 *
 * The `summary` block in the same payload is worse, because the two writers
 * disagree about it: /api/admin/rescan-v2-leaderboard divides it by 1e18 before
 * storing, and /api/debug/leaderboard-data does not. One field, two units, no
 * marker saying which. Nothing here reads it. The totals below are summed from
 * the rows actually on screen, which is a figure this component can stand
 * behind, and it is labelled as being about those rows rather than the platform.
 */

interface LeaderboardUser {
  rank: number;
  address: string;
  totalStakedETH: number;
  totalStakedSWIPE: number;
  predictionsParticipated: number;
}

interface RealLeaderboardData {
  ethLeaderboard: LeaderboardUser[];
  swipeLeaderboard: LeaderboardUser[];
  farcasterProfiles: unknown[];
  totalUsers: number;
  totalPredictions: number;
  summary?: {
    totalETHStaked: number;
    totalSWIPEStaked: number;
    totalPredictionsParticipated: number;
  };
}

/**
 * What the archived read produced.
 *
 * `missing` and `failed` were one branch before, which meant a 500 or a dropped
 * connection rendered the sentence "there isn't one cached right now". That is a
 * claim about Redis made by code that never heard back from it.
 */
type SnapshotView =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed'; reason: string }
  | { state: 'ok'; data: RealLeaderboardData };

/**
 * The view plus the chain it answers for.
 *
 * Carrying the chain is what stops the previous chain's standings painting for
 * a frame under the new chain's name. Clearing state at the top of the effect
 * is not enough on its own, because an effect runs after the commit: the render
 * that changes chain has already gone to the screen by then, still holding the
 * old board.
 */
interface Snapshot {
  chain: ChainKey;
  view: SnapshotView;
}

type Pool = 'eth' | 'swipe';

const compact = (amount: number) => {
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(2);
};

export function Leaderboard() {
  // The active chain travels with every read below. The server defaults to Base
  // when no chain is sent, which is right for Base and wrong for every other
  // chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey, chain } = useActiveChain();
  const [selectedPool, setSelectedPool] = useState<Pool>('eth');
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    chain: chainKey,
    view: { state: 'loading' },
  }));

  // Which request the state belongs to, so a slow answer for the chain the user
  // has already left cannot land on top of the chain they are looking at.
  const ticketRef = useRef(0);

  useEffect(() => {
    const ticket = ++ticketRef.current;
    const current = () => ticket === ticketRef.current;

    const load = async () => {
      const settle = (view: SnapshotView) => setSnapshot({ chain: chainKey, view });

      // Drop the previous chain's board before asking for this one. A chain with
      // no snapshot cached 404s, and without this the old standings would sit
      // there under the new chain's name as if they were its own.
      settle({ state: 'loading' });
      try {
        const response = await fetch(`/api/leaderboard/real-data?chain=${chainKey}`);
        if (!current()) return;

        // The route answers 404 for "nobody has collected one", which is a fact
        // about the data, and 5xx for "the read broke", which is not.
        if (response.status === 404) {
          settle({ state: 'missing' });
          return;
        }
        if (!response.ok) {
          settle({ state: 'failed', reason: `the server answered ${response.status}` });
          return;
        }

        const body = await response.json();
        if (!current()) return;
        if (!body.success || !body.data) {
          settle({ state: 'missing' });
          return;
        }
        settle({ state: 'ok', data: body.data as RealLeaderboardData });
      } catch (error) {
        if (!current()) return;
        console.error('Failed to load the archived leaderboard:', error);
        settle({
          state: 'failed',
          reason: error instanceof Error ? error.message : 'the request failed',
        });
      }
    };

    load();
    // chainKey, because the effect reads it. It is the default on the first
    // render and only becomes the stored preference after mount, so an empty
    // array here pinned the board to Base: the switcher moved, the heading
    // moved, and the standings underneath stayed Base's.
  }, [chainKey]);

  // A snapshot only speaks for the chain it was fetched for. Anything else is
  // the previous chain's board and counts as nothing yet.
  const view: SnapshotView =
    snapshot.chain === chainKey ? snapshot.view : { state: 'loading' };
  const realData = view.state === 'ok' ? view.data : null;

  const addresses = useMemo(() => {
    if (!realData) return [];
    const eth = realData.ethLeaderboard?.map((u) => u.address) || [];
    const swipe = realData.swipeLeaderboard?.map((u) => u.address) || [];
    return [...new Set([...eth, ...swipe])];
  }, [realData]);

  const { profiles } = useFarcasterProfiles(addresses);

  const ranked = useMemo(() => {
    if (!realData) return [];
    const list =
      selectedPool === 'eth'
        ? realData.ethLeaderboard || []
        : realData.swipeLeaderboard || [];

    // Sorted inside one pool, on that pool's own token. Two tokens are never
    // compared against each other, here or anywhere on this screen.
    return rankByPool(list, selectedPool);
  }, [selectedPool, realData]);

  // Whether these per person figures were measured off the contract or worked
  // out by dividing a pool between its participants. See leaderboardMath.
  const apportioned = isApportioned(realData?.summary);

  const getInitials = (profile: { display_name?: string | null } | undefined, address: string) => {
    if (profile?.display_name) {
      return profile.display_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return address.slice(2, 4).toUpperCase();
  };

  const poolLabel = selectedPool === 'eth' ? 'ETH' : 'SWIPE';

  // Summed from the rows on screen, in one token, so the figure means what the
  // label next to it says. The cached `summary` is not used; see the file note.
  const shownTotal = shownPoolTotal(ranked, selectedPool);

  const tabs = (
    <div className="lb-tabs">
      <div className="sheet-segment" role="group" aria-label="Which archived pool to rank by">
        <button
          type="button"
          className="sheet-segment-item"
          aria-pressed={selectedPool === 'eth'}
          onClick={() => setSelectedPool('eth')}
        >
          <img src="/eth.png" alt="" className="lb-tab-icon" />
          ETH pools
        </button>
        <button
          type="button"
          className="sheet-segment-item"
          aria-pressed={selectedPool === 'swipe'}
          onClick={() => setSelectedPool('swipe')}
        >
          <img src="/logo.png" alt="" className="lb-tab-icon" />
          SWIPE pools
        </button>
      </div>
    </div>
  );

  let archivedBody: React.ReactNode;

  if (view.state === 'loading') {
    archivedBody = (
      <div className="sheet-empty">
        <strong>Reading the snapshot</strong>
        Pulling the cached scan of the old contracts out of Redis.
      </div>
    );
  } else if (view.state === 'failed') {
    archivedBody = (
      <div className="sheet-empty">
        <strong>Could not read the snapshot</strong>
        The archived board did not load, because {view.reason}. Whether one is cached
        is not something this screen can tell you right now.
      </div>
    );
  } else if (view.state === 'missing') {
    archivedBody = (
      <div className="sheet-empty">
        <strong>Nothing collected for this chain</strong>
        The archived board is built from a scan an admin runs into Redis, and there is
        none cached for {chain.label}. Only Base ever had one, because the old ETH and
        SWIPE contracts only ever existed there.
      </div>
    );
  } else if (ranked.length === 0) {
    archivedBody = (
      <>
        {tabs}
        <div className="sheet-empty">
          <strong>Nobody staked in this pool</strong>
          The scan found no {poolLabel} positions. Try the other pool.
        </div>
      </>
    );
  } else {
    archivedBody = (
      <>
        {tabs}
        <div className="lb-table">
          <div className="lb-head" aria-hidden="true">
            <span>Rank</span>
            <span>Player</span>
            <span>Staked</span>
            <span>Markets</span>
          </div>

          {ranked.map((user) => {
            const profile = profiles.find((p) => p && p.address === user.address);
            const hasFarcaster = profile && profile.fid !== null && !profile.isWalletOnly;
            const staked = archivedUnits(rowStake(user, selectedPool));

            return (
              <div key={user.address} className="lb-row">
                <div className={`lb-rank${user.rank <= 3 ? ' lb-rank--top' : ''}`}>
                  {String(user.rank).padStart(2, '0')}
                </div>

                <div className="lb-who">
                  <Avatar className={`lb-avatar${hasFarcaster ? '' : ' lb-avatar--wallet'}`}>
                    <AvatarImage
                      src={hasFarcaster ? profile?.pfp_url || undefined : undefined}
                      alt=""
                    />
                    <AvatarFallback>
                      <span className="text-white text-xs font-semibold">
                        {getInitials(profile, user.address)}
                      </span>
                    </AvatarFallback>
                  </Avatar>

                  <div className="lb-who-text">
                    <div className="lb-name">
                      {hasFarcaster
                        ? profile?.display_name || `Wallet ${user.address.slice(2, 6)}`
                        : `Wallet ${user.address.slice(2, 6)}`}
                    </div>
                    <div className="lb-handle">
                      {hasFarcaster
                        ? `@${profile?.username}`
                        : `${user.address.slice(0, 6)}…${user.address.slice(-4)}`}
                    </div>
                  </div>
                </div>

                <div className="lb-stats">
                  <div>
                    <span className="lb-stat-label">
                      {apportioned ? 'Apportioned' : 'Staked'}
                    </span>
                    <span className="lb-figure">
                      {selectedPool === 'eth' ? staked.toFixed(4) : compact(staked)}
                      <span className="lb-figure-unit">{poolLabel}</span>
                    </span>
                  </div>
                  <div>
                    <span className="lb-stat-label">Markets</span>
                    <span className="lb-count">{user.predictionsParticipated}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Leaderboard</p>
              <h1 className="sheet-hero-title">
                Who put the <em>most</em> in
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Two boards, because there are two eras. The first is the contract taking bets
            today, settled in the chain&apos;s own stablecoin. Below it is what happened
            on the old ETH and SWIPE contracts, which accept nothing new and whose figures
            are never added to the ones above.
          </p>
        </header>

        <main className="sheet-body">
          <LeaderboardNow chainKey={chainKey} />

          <section className="sheet-block">
            <div className="sheet-rail">
              <p className="sheet-eyebrow">Old contracts</p>
              <p className="sheet-rail-meta">
                {view.state === 'ok'
                  ? `${ranked.length} ranked\nby ${poolLabel} staked`
                  : 'Archived,\nnot live'}
              </p>
            </div>
            <div>{archivedBody}</div>
          </section>

          {view.state === 'ok' && (
            <section className="sheet-block">
              <div className="sheet-rail">
                <p className="sheet-eyebrow">The snapshot</p>
                <p className="sheet-rail-meta">{`Collected,\nnot live`}</p>
              </div>
              <div>
                <div className="sheet-board">
                  <div className="sheet-settle">
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">People the scan found</span>
                      <span className="sheet-settle-val">{realData?.totalUsers ?? 0}</span>
                    </div>
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Markets the scan covered</span>
                      <span className="sheet-settle-val">
                        {realData?.totalPredictions ?? 0}
                      </span>
                    </div>
                    <div className="sheet-settle-row sheet-settle-row--total">
                      <span className="sheet-settle-key">
                        {poolLabel} across the {ranked.length} shown
                      </span>
                      <span className="sheet-settle-val">
                        {selectedPool === 'eth' ? shownTotal.toFixed(4) : compact(shownTotal)}{' '}
                        {poolLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="sheet-note">
                  <p>
                    Those pools are on contracts nobody holds the key to. They take no new
                    bets and they can never be settled, so this is a record of what
                    happened rather than a standing anyone can still change.
                  </p>
                  {apportioned ? (
                    <p>
                      The per person figures here are not measured positions. The scan
                      behind this cache takes each market&apos;s pool and divides it evenly
                      between everyone who bet in it, so a small bet alongside a whale is
                      credited with the whale&apos;s share. Read the order as rough. An
                      admin running the full contract rescan replaces it with real
                      positions.
                    </p>
                  ) : (
                    <p>
                      The per person figures are read off the old contract one position at
                      a time. The scan is cached, so it lags the chain by however long ago
                      it ran.
                    </p>
                  )}
                  <p>
                    Names and pictures are Farcaster profiles where the address has one,
                    and a shortened address where it does not. Nothing on this page is a
                    stand in for a person we could not identify.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
