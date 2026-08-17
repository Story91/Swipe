"use client";

import React, { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import type { StakeToken } from '@/lib/userStake';
import { usePortfolio, type PortfolioRow } from './usePortfolio';
import {
  symbolFor,
  isArchivedLeg,
  formatAmount,
  formatSigned,
  totalsByToken,
  tokenRank,
  rowKey,
} from './portfolioTokens';
import { StaleNotice, ArchivedNote, ArchivedTag } from './PortfolioNotes';
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
 * market was resolved, so rather than invent one, the window filters on when
 * the stake was placed and says so.
 *
 * The fifth was the unit. Every profit here was printed with ETH beside it,
 * including positions held in the chain's stablecoin, and the window totals
 * added the two together. Results are now per token, and the summary is one
 * ledger for each.
 */

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

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export function BetHistory() {
  const { address } = useAccount();
  // Same read as the other two screens, so the chain that was asked for is the
  // chain whose symbol gets printed.
  const { chainKey, rows, loading, error, refresh } = usePortfolio(address);

  const symbol = (token: StakeToken | undefined) => symbolFor(token, chainKey);

  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [timeRange, setTimeRange] = useState<Range>('30d');

  const settledRows = useMemo(
    () => (rows ?? []).filter((row) => row.status === 'won' || row.status === 'lost'),
    [rows]
  );

  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.key === timeRange)?.days ?? null;
    const cutoff = days === null ? 0 : Date.now() - days * 86_400_000;

    const filtered = settledRows
      .filter((b) => (filter === 'all' ? true : b.status === filter))
      .filter((b) => b.createdAt >= cutoff);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'profit':
        case 'stake': {
          // Grouped by token before size, because a result of +25 USDC and a
          // result of +0.5 ETH cannot be put in one order without implying a
          // conversion nobody did.
          const byToken = tokenRank(a.token) - tokenRank(b.token);
          if (byToken !== 0) return byToken;
          return sortBy === 'profit' ? b.profit - a.profit : b.stakeAmount - a.stakeAmount;
        }
        case 'date':
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }, [settledRows, filter, sortBy, timeRange]);

  const won = shown.filter((b) => b.status === 'won').length;
  const winRate = shown.length > 0 ? (won / shown.length) * 100 : null;
  const perToken = useMemo(() => totalsByToken(shown), [shown]);
  const hasArchived = shown.some((bet) => isArchivedLeg(bet.token));

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

  // Only while there is nothing else to show. A failed refresh leaves the rows
  // where they are, because history that was read a minute ago is still history.
  if (rows === null && loading) {
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

  if (rows === null) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Settled</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not read your history</strong>
            {error ?? 'The portfolio service did not answer.'}
            <p>
              <button type="button" className="sheet-action" onClick={refresh}>
                Try again
              </button>
            </p>
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
          {error && <StaleNotice error={error} onRetry={refresh} />}

          <div className="bh-controls">
            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-filter-label">Show</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-filter-label">
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

            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-range-label">Staked in</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-range-label">
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

            <div className="bh-control-group">
              <span className="bh-control-label" id="bh-sort-label">Sort</span>
              <div className="sheet-segment" role="group" aria-labelledby="bh-sort-label">
                {SORTS.map((s) => (
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

          {hasArchived && <ArchivedNote />}

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

              {shown.map((bet: PortfolioRow) => {
                const pool = (bet.yesPool || 0) + (bet.noPool || 0);
                const archived = isArchivedLeg(bet.token);
                return (
                  // Keyed on market and token, because one market backed in two
                  // tokens arrives as two rows carrying the same id.
                  <div key={rowKey(bet.id, bet.token)} className="bh-row">
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
                          <span className="bh-age">
                            {formatAmount(pool, bet.token)} {symbol(bet.token)} pool
                          </span>
                        )}
                        {archived && <ArchivedTag />}
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
                        {formatSigned(bet.profit, bet.token)} {symbol(bet.token)}
                        <span className="bh-figure-sub">
                          on {formatAmount(bet.stakeAmount, bet.token)} staked
                        </span>
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
            <div className="sheet-board-head">
              <h2 className="sheet-board-title">Calls</h2>
              <p className="sheet-board-meta">Every token</p>
            </div>
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Settled</span>
                <span className="sheet-settle-val">{shown.length}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Called right</span>
                <span className="sheet-settle-val">
                  {winRate === null ? 'nothing settled' : `${winRate.toFixed(1)}%`}
                  <span className="sheet-settle-sub">
                    {won} of {shown.length}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {perToken.length > 0 && (
            <div className="bh-summary">
              {perToken.map((total) => (
                <div key={total.token} className="sheet-board">
                  <div className="sheet-board-head">
                    <h2 className="sheet-board-title">
                      {symbol(total.token)}
                      {isArchivedLeg(total.token) ? ', archived' : ''}
                    </h2>
                    <p className="sheet-board-meta">
                      {total.count} {total.count === 1 ? 'position' : 'positions'}
                    </p>
                  </div>
                  <div className="sheet-settle">
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Staked</span>
                      <span className="sheet-settle-val">
                        {formatAmount(total.staked, total.token)} {symbol(total.token)}
                      </span>
                    </div>
                    <div className="sheet-settle-row sheet-settle-row--total">
                      <span className="sheet-settle-key">Net</span>
                      <span className="sheet-settle-val">
                        {formatSigned(total.profit, total.token)} {symbol(total.token)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
