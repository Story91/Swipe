"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import '../../styles/sheet.css';
import './Leaderboard.css';

/**
 * Top stakers, on the shared sheet.
 *
 * The board is a snapshot: /api/leaderboard/real-data serves whatever an admin
 * last collected into Redis, and 404s when nothing has been collected.
 *
 * That empty case used to fall back to ten hardcoded addresses with invented
 * stake amounts, rendered identically to real entries, under a footer that read
 * "Real data from blockchain and Farcaster profiles". Invented rankings of
 * invented wallets are worse than an empty board, so the fallback is gone and
 * the empty state says what happened instead.
 *
 * Figures are V2-era: the ETH and SWIPE pools are on the archived contracts, so
 * this ranks historical staking rather than anything currently live.
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
  farcasterProfiles: any[];
  totalUsers: number;
  totalPredictions: number;
  summary: {
    totalETHStaked: number;
    totalSWIPEStaked: number;
    totalPredictionsParticipated: number;
  };
}

type Pool = 'eth' | 'swipe';

/**
 * Cached amounts arrive either already denominated or still in wei, depending
 * on which collector wrote them. Anything above 1e15 is wei by inspection: no
 * real position is 10^15 ETH, and no real position is 0.000001 wei.
 */
const asWhole = (amount: number) => (amount > 1e15 ? amount / 1e18 : amount);

const compact = (amount: number) => {
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(0);
};

export function Leaderboard() {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const [selectedPool, setSelectedPool] = useState<Pool>('eth');
  const [loading, setLoading] = useState(true);
  const [realData, setRealData] = useState<RealLeaderboardData | null>(null);

  useEffect(() => {
    const loadRealData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/leaderboard/real-data?chain=${chainKey}`);

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setRealData(data.data);
          }
        }
      } catch (error) {
        console.error('❌ Failed to load cached leaderboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRealData();
  }, []);

  const addresses = useMemo(() => {
    if (!realData) return [];
    const eth = realData.ethLeaderboard?.map(u => u.address) || [];
    const swipe = realData.swipeLeaderboard?.map(u => u.address) || [];
    return [...new Set([...eth, ...swipe])];
  }, [realData]);

  const { profiles } = useFarcasterProfiles(addresses);

  const ranked = useMemo(() => {
    if (!realData) return [];
    const list = selectedPool === 'eth'
      ? realData.ethLeaderboard || []
      : realData.swipeLeaderboard || [];

    return [...list]
      .sort((a, b) => selectedPool === 'eth'
        ? b.totalStakedETH - a.totalStakedETH
        : b.totalStakedSWIPE - a.totalStakedSWIPE)
      .map((user, index) => ({ ...user, rank: index + 1 }));
  }, [selectedPool, realData]);

  const getInitials = (profile: any, address: string) => {
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

  const shell = (body: React.ReactNode) => (
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
            Ranked by total staked across the ETH and SWIPE pools. These are
            V2-era figures on the archived contracts, so the board is a record
            of what happened rather than a live standing.
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
          <p className="sheet-eyebrow">Standings</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading the snapshot</strong>
            Pulling the cached board out of Redis.
          </div>
        </div>
      </section>
    );
  }

  if (!realData) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Standings</p>
          <p className="sheet-rail-meta">{`No snapshot\ncached`}</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Nothing collected yet</strong>
            This board is built from a snapshot an admin collects into Redis,
            and there isn&apos;t one cached right now. It fills in once the next
            collection runs.
          </div>
        </div>
      </section>
    );
  }

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Standings</p>
          <p className="sheet-rail-meta">
            {`${ranked.length} ranked\nby ${poolLabel} staked`}
          </p>
        </div>
        <div>
          <div className="lb-tabs">
            <div className="sheet-segment" role="group" aria-label="Which pool to rank by">
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

          {ranked.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nobody staked in this pool</strong>
              Try the other one.
            </div>
          ) : (
            <div className="lb-table">
              <div className="lb-head" aria-hidden="true">
                <span>Rank</span>
                <span>Player</span>
                <span>Staked</span>
                <span>Markets</span>
              </div>

              {ranked.map(user => {
                const profile = profiles.find(p => p && p.address === user.address);
                const hasFarcaster = profile && profile.fid !== null && !profile.isWalletOnly;
                const staked = selectedPool === 'eth'
                  ? asWhole(user.totalStakedETH)
                  : asWhole(user.totalStakedSWIPE);

                return (
                  <div key={user.address} className="lb-row">
                    <div className={`lb-rank${user.rank <= 3 ? ' lb-rank--top' : ''}`}>
                      {String(user.rank).padStart(2, '0')}
                    </div>

                    <div className="lb-who">
                      <Avatar className={`lb-avatar${hasFarcaster ? '' : ' lb-avatar--wallet'}`}>
                        <AvatarImage
                          src={hasFarcaster ? (profile?.pfp_url || undefined) : undefined}
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
                            ? (profile?.display_name || `User ${user.address.slice(2, 6)}`)
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
                        <span className="lb-stat-label">Staked</span>
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
          )}
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">The snapshot</p>
          <p className="sheet-rail-meta">{`Collected,\nnot live`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Players in the snapshot</span>
                <span className="sheet-settle-val">{realData.totalUsers}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Markets covered</span>
                <span className="sheet-settle-val">{realData.totalPredictions}</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Total {poolLabel} staked</span>
                <span className="sheet-settle-val">
                  {selectedPool === 'eth'
                    ? asWhole(realData.summary?.totalETHStaked ?? 0).toFixed(4)
                    : compact(asWhole(realData.summary?.totalSWIPEStaked ?? 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              Figures come from a cached collection rather than a live read, so
              they lag the chain by however long ago that collection ran. Names
              and avatars are Farcaster profiles where the address has one, and
              a shortened address where it does not.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
