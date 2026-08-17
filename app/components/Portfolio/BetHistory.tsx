"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import '../../styles/sheet.css';
import './BetHistory.css';

/**
 * Settled positions, on the shared sheet.
 *
 * Four fabricated fields are gone from this screen.
 *
 * The worst was `outcome`, which was derived from the user's own choice. Every
 * settled row therefore claimed the user had called it right, including the
 * rows it simultaneously labelled "lost". /api/portfolio returns the market's
 * real outcome now.
 *
 * `yourPercentage` was `Math.random() * 10 + 1`, so a user's share of the pool
 * changed every time the 30s refresh fired. `poolSize` was `stake * 3`. Both
 * are replaced by the market's real pools.
 *
 * `resolvedAt` was `createdAt + 1 day`, and the time-range filter ran on it, so
 * "last 7 days" filtered on invented dates. Nothing in Redis records when a
 * market was resolved, so rather than invent one, the window now filters on
 * when the stake was placed and says so.
 */

interface HistoricalBet {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  status: 'won' | 'lost';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
  yesPool: number;
  noPool: number;
  outcome?: 'YES' | 'NO';
}

type Filter = 'all' | 'won' | 'lost';
type SortKey = 'date' | 'profit' | 'stake';
type Range = '7d' | '30d' | '90d' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Newest' },
  { key: 'profit', label: 'Result' },
  { key: 'stake', label: 'Stake' },
];

const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

const signed = (n: number, dp = 4) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(dp)}`;

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export function BetHistory() {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const { address } = useAccount();
  const [bets, setBets] = useState<HistoricalBet[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [timeRange, setTimeRange] = useState<Range>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBetHistory = async () => {
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
          setBets(
            portfolio.filter(
              (item: HistoricalBet) => item.status === 'won' || item.status === 'lost'
            )
          );
        } else {
          throw new Error(result.error || 'Failed to fetch bet history');
        }
      } catch (err) {
        console.error('❌ Failed to fetch bet history:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch bet history data');
      } finally {
        setLoading(false);
      }
    };

    fetchBetHistory();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchBetHistory, 30000);
    return () => clearInterval(interval);
  }, [address]);

  const shown = useMemo(() => {
    const days = RANGES.find(r => r.key === timeRange)?.days ?? null;
    const cutoff = days === null ? 0 : Date.now() - days * 86_400_000;

    const filtered = bets
      .filter(b => (filter === 'all' ? true : b.status === filter))
      .filter(b => b.createdAt >= cutoff);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'stake':
          return b.stakeAmount - a.stakeAmount;
        case 'date':
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }, [bets, filter, sortBy, timeRange]);

  const won = shown.filter(b => b.status === 'won').length;
  const staked = shown.reduce((sum, b) => sum + b.stakeAmount, 0);
  const net = shown.reduce((sum, b) => sum + b.profit, 0);
  const winRate = shown.length > 0 ? (won / shown.length) * 100 : 0;

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">History</p>
              <h1 className="sheet-hero-title">
                How it <em>turned out</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Every position that has settled, what you called and what the market
            did. The window filters on when you staked, not when the market
            resolved, because resolution times are not recorded.
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
          <p className="sheet-eyebrow">Settled</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>No wallet connected</strong>
            Connect a wallet to see how its positions went.
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Settled</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading your history</strong>
            Matching your stakes against resolved markets.
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Settled</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load your history</strong>
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
          <p className="sheet-eyebrow">Settled</p>
          <p className="sheet-rail-meta">
            {`${shown.length} position${shown.length === 1 ? '' : 's'}\nstaked in the last ${timeRange}`}
          </p>
        </div>
        <div>
          <div className="bh-controls">
            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-filter-label">Show</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-filter-label">
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

            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-range-label">Staked in</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-range-label">
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

            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-sort-label">Sort</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-sort-label">
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
              <strong>Nothing settled in this window</strong>
              Widen it, or wait for a market you backed to resolve.
            </div>
          ) : (
            <div className="bh-list">
              <div className="bh-head" aria-hidden="true">
                <span />
                <span>Market</span>
                <span>Call and result</span>
                <span>Returned</span>
              </div>

              {shown.map(bet => {
                const pool = (bet.yesPool || 0) + (bet.noPool || 0);
                return (
                  <div key={bet.id} className="bh-row">
                    {bet.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="bh-thumb" src={bet.imageUrl} alt="" />
                    ) : (
                      <span className="bh-thumb" />
                    )}

                    <div className="bh-main">
                      <div className="bh-question">{bet.question}</div>
                      <div className="bh-sub">
                        {bet.category && <span className="bh-category">{bet.category}</span>}
                        <span className="bh-age">staked {timeAgo(bet.createdAt)}</span>
                        {pool > 0 && (
                          <span className="bh-age">{pool.toFixed(3)} ETH pool</span>
                        )}
                      </div>
                    </div>

                    <div className="bh-result">
                      <span className="bh-call">
                        you said{' '}
                        <span className={`bh-side bh-side--${bet.choice === 'YES' ? 'yes' : 'no'}`}>
                          {bet.choice}
                        </span>
                        {', '}
                        {bet.outcome ? (
                          <>
                            it was{' '}
                            <span className={`bh-side bh-side--${bet.outcome === 'YES' ? 'yes' : 'no'}`}>
                              {bet.outcome}
                            </span>
                          </>
                        ) : (
                          <span className="bh-side bh-side--unknown">outcome not recorded</span>
                        )}
                      </span>
                      <span className={`bh-verdict bh-verdict--${bet.status}`}>
                        {bet.status}
                      </span>
                    </div>

                    <div className="bh-figures">
                      <span
                        className={`bh-figure ${bet.profit >= 0 ? 'bh-figure--gain' : 'bh-figure--loss'}`}
                      >
                        {signed(bet.profit)} ETH
                        <span className="bh-figure-sub">on {bet.stakeAmount} staked</span>
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
          <p className="sheet-eyebrow">In this window</p>
          <p className="sheet-rail-meta">{`Settled positions\nonly`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Settled</span>
                <span className="sheet-settle-val">{shown.length}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Called right</span>
                <span className="sheet-settle-val">
                  {winRate.toFixed(1)}%
                  <span className="sheet-settle-sub">
                    {won} of {shown.length}
                  </span>
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Staked</span>
                <span className="sheet-settle-val">{staked.toFixed(4)} ETH</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Net</span>
                <span className="sheet-settle-val">{signed(net)} ETH</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
