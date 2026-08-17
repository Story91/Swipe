"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import '../../styles/sheet.css';
import './ActiveBets.css';

/**
 * Open positions, on the shared sheet.
 *
 * The countdown and the odds bar are now real. This screen used to derive
 * "time left" from `createdAt + 7 days`, a deadline no market actually has,
 * and drew every odds bar at a hardcoded 50/50 with a pool of
 * `stake * 2`. /api/portfolio carries the market's real deadline and both
 * pools now, so all three come from the market.
 *
 * That mattered more than it looks: an invented countdown in a betting app
 * tells someone they still have time to change their mind on a market that may
 * already have closed.
 */

interface ActiveBet {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
  /** Unix seconds. */
  deadline: number;
  yesPool: number;
  noPool: number;
}

type Filter = 'all' | 'yes' | 'no';
type SortKey = 'time' | 'stake' | 'profit';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Both sides' },
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'time', label: 'Closing' },
  { key: 'stake', label: 'Stake' },
  { key: 'profit', label: 'Upside' },
];

/** Real time remaining against the market's own deadline. */
function timeLeft(deadlineSeconds: number) {
  if (!deadlineSeconds) return { text: 'No deadline', ended: false, soon: false };

  const diff = deadlineSeconds * 1000 - Date.now();
  if (diff <= 0) return { text: 'Closed', ended: true, soon: false };

  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  const soon = hours < 24;

  if (days > 0) return { text: `${days}d ${hours % 24}h`, ended: false, soon };
  if (hours > 0) return { text: `${hours}h`, ended: false, soon };
  return { text: `${Math.max(1, Math.floor(diff / 60000))}m`, ended: false, soon: true };
}

export function ActiveBets() {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const { address } = useAccount();
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActiveBets = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio?userAddress=${address}&chain=${chainKey}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          const { portfolio } = result.data;
          setActiveBets(
            portfolio.filter((item: ActiveBet & { status: string }) => item.status === 'active')
          );
        } else {
          throw new Error(result.error || 'Failed to fetch active bets');
        }
      } catch (err) {
        console.error('❌ Failed to fetch active bets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch active bets data');
      } finally {
        setLoading(false);
      }
    };

    fetchActiveBets();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchActiveBets, 30000);
    return () => clearInterval(interval);
    // chainKey belongs here. It starts at the default and only picks up the
    // stored preference after mount, so an effect that omits it fetches Base
    // once and never again, and the interval it starts keeps that same closure
    // and re-fetches Base every 30 seconds. The switcher changed the label
    // while these positions stayed Base's.
  }, [address, chainKey]);

  const shown = useMemo(() => {
    const filtered = activeBets.filter(bet =>
      filter === 'all' ? true : bet.choice.toLowerCase() === filter
    );

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'stake':
          return b.stakeAmount - a.stakeAmount;
        case 'profit':
          return b.profit - a.profit;
        case 'time':
        default:
          // Soonest to close first, which is the one worth acting on.
          return (a.deadline || Infinity) - (b.deadline || Infinity);
      }
    });
  }, [activeBets, filter, sortBy]);

  const atStake = shown.reduce((sum, b) => sum + b.stakeAmount, 0);
  const upside = shown.reduce((sum, b) => sum + b.profit, 0);

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Open positions</p>
              <h1 className="sheet-hero-title">
                Still <em>running</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Markets you are in that have not settled. The countdown is the
            market&apos;s own deadline and the bar is where the money actually
            sits, so you can see whether you are with the crowd or against it.
          </p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  if (!address) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>No wallet connected</strong>
            Connect a wallet to see what it is holding.
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading open positions</strong>
            Checking which markets are still running.
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load your positions</strong>
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
          <p className="sheet-eyebrow">Open</p>
          <p className="sheet-rail-meta">
            {`${shown.length} position${shown.length === 1 ? '' : 's'}\nnot yet settled`}
          </p>
        </div>
        <div>
          <div className="ab-controls">
            <div className="ab-control-group">
              <span className="ab-control-label" id="ab-filter-label">Side</span>
              <div className="sheet-segment" role="group" aria-labelledby="ab-filter-label">
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

            <div className="ab-control-group">
              <span className="ab-control-label" id="ab-sort-label">Sort</span>
              <div className="sheet-segment" role="group" aria-labelledby="ab-sort-label">
                {SORTS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    className="sheet-segment-item"
                    aria-pressed={sortBy === s.key}
                    onClick={() => setSortBy(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing open</strong>
              {filter === 'all'
                ? 'Positions you are still holding will appear here.'
                : `You have nothing open on ${filter.toUpperCase()}.`}
            </div>
          ) : (
            <div className="ab-list">
              <div className="ab-head" aria-hidden="true">
                <span />
                <span>Market</span>
                <span>Where the money is</span>
                <span>Closes</span>
              </div>

              {shown.map(bet => {
                const clock = timeLeft(bet.deadline);
                const pool = (bet.yesPool || 0) + (bet.noPool || 0);
                const yesPct = pool > 0 ? ((bet.yesPool || 0) / pool) * 100 : null;

                return (
                  <div key={bet.id} className="ab-row">
                    {bet.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="ab-thumb" src={bet.imageUrl} alt="" />
                    ) : (
                      <span className="ab-thumb" />
                    )}

                    <div className="ab-main">
                      <div className="ab-question">{bet.question}</div>
                      <div className="ab-sub">
                        {bet.category && <span className="ab-category">{bet.category}</span>}
                        <span className={`ab-side ab-side--${bet.choice === 'YES' ? 'yes' : 'no'}`}>
                          {bet.choice}
                        </span>
                        <span className="ab-odds-note">
                          {bet.stakeAmount} ETH staked
                        </span>
                      </div>
                    </div>

                    <div className="ab-odds">
                      {yesPct === null ? (
                        // No pool data rather than a made-up even split: an
                        // invented 50/50 reads as a real market read.
                        <span className="ab-odds-note">Pool not reported</span>
                      ) : (
                        <>
                          <div className="ab-odds-figures">
                            <span>{yesPct.toFixed(0)}% yes</span>
                            <span>{(100 - yesPct).toFixed(0)}% no</span>
                          </div>
                          <div className="ab-odds-track">
                            <span className="ab-odds-yes" style={{ width: `${yesPct}%` }} />
                            <span className="ab-odds-no" style={{ width: `${100 - yesPct}%` }} />
                          </div>
                          <span className="ab-odds-note">{pool.toFixed(3)} ETH in the pool</span>
                        </>
                      )}
                    </div>

                    <div
                      className={`ab-clock${clock.ended ? ' ab-clock--ended' : clock.soon ? ' ab-clock--soon' : ''}`}
                    >
                      {clock.text}
                      <span className="ab-clock-sub">
                        {bet.potentialPayout.toFixed(4)} if it lands
                      </span>
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
          <p className="sheet-eyebrow">Exposure</p>
          <p className="sheet-rail-meta">{`What is riding\non these`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Positions open</span>
                <span className="sheet-settle-val">{shown.length}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">At stake</span>
                <span className="sheet-settle-val">{atStake.toFixed(4)} ETH</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Upside if every one lands</span>
                <span className="sheet-settle-val">+{upside.toFixed(4)} ETH</span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              Upside assumes <strong>every</strong> open position wins, which is
              not a forecast. Positions on opposite sides of the same question
              cannot both land.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
