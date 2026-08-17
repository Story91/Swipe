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
import './ActiveBets.css';

/**
 * Open positions, on the shared sheet.
 *
 * The countdown and the odds bar are real. This screen used to derive "time
 * left" from `createdAt + 7 days`, a deadline no market has, and drew every
 * odds bar at a hardcoded 50/50 with a pool of `stake * 2`. /api/portfolio
 * carries the market's own deadline and both pools, so all three come from the
 * market.
 *
 * The units are real too, which they were not. Every figure here had the word
 * ETH typed next to it, on a screen that lists collateral positions: a bet of
 * twenty five dollars on Robinhood was announced as "25 ETH", and the exposure
 * ledger at the bottom added dollars to ether and printed the result as one
 * number. Exposure is now one ledger per token, and nothing on this screen is
 * summed across tokens.
 */

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
  const { address } = useAccount();
  // The chain comes out of the same hook that sent it, so the symbol beside a
  // figure is always the symbol of the chain the figure was read from.
  const { chainKey, rows, loading, error, refresh } = usePortfolio(address);

  const symbol = (token: StakeToken | undefined) => symbolFor(token, chainKey);

  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('time');

  /**
   * Everything that has not settled, which is more than the markets still
   * taking bets.
   *
   * `pending` is a market whose deadline has passed with no result recorded, or
   * one that was cancelled. The old screen dropped those rows entirely, so a
   * stake sitting in a market that closed last week simply vanished from the
   * one screen whose job is to show what you are still holding.
   */
  const openRows = useMemo(
    () => (rows ?? []).filter((row) => row.status === 'active' || row.status === 'pending'),
    [rows]
  );

  const shown = useMemo(() => {
    const filtered = openRows.filter((bet) =>
      filter === 'all' ? true : bet.choice.toLowerCase() === filter
    );

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'stake':
        case 'profit': {
          // Tokens first, then size inside a token. Ranking 25 USDC above
          // 0.5 ETH would be a claim that one is bigger than the other, and
          // those two numbers are not comparable.
          const byToken = tokenRank(a.token) - tokenRank(b.token);
          if (byToken !== 0) return byToken;
          return sortBy === 'stake' ? b.stakeAmount - a.stakeAmount : b.profit - a.profit;
        }
        case 'time':
        default:
          // Soonest to close first, which is the one worth acting on.
          return (a.deadline || Infinity) - (b.deadline || Infinity);
      }
    });
  }, [openRows, filter, sortBy]);

  const exposure = useMemo(() => totalsByToken(shown), [shown]);
  const hasArchived = shown.some((bet) => isArchivedLeg(bet.token));

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
            Positions past their deadline with no result yet are here too.
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

  // A read in flight and a read that failed only take the screen while there is
  // nothing on it. After that they are a line above the rows, because rows that
  // were read a minute ago are worth more than a spinner.
  if (rows === null && loading) {
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

  if (rows === null) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not read your positions</strong>
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
          <p className="sheet-eyebrow">Open</p>
          <p className="sheet-rail-meta">
            {`${shown.length} position${shown.length === 1 ? '' : 's'}\nnot yet settled`}
          </p>
        </div>
        <div>
          {error && <StaleNotice error={error} onRetry={refresh} />}

          <div className="ab-controls">
            <div className="ab-control-group">
              <span className="ab-control-label" id="ab-filter-label">Side</span>
              <div className="sheet-segment" role="group" aria-labelledby="ab-filter-label">
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

            <div className="ab-control-group">
              <span className="ab-control-label" id="ab-sort-label">Sort</span>
              <div className="sheet-segment" role="group" aria-labelledby="ab-sort-label">
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

              {shown.map((bet: PortfolioRow) => {
                const clock = timeLeft(bet.deadline);
                const pool = (bet.yesPool || 0) + (bet.noPool || 0);
                const yesPct = pool > 0 ? ((bet.yesPool || 0) / pool) * 100 : null;
                const archived = isArchivedLeg(bet.token);

                return (
                  // Keyed on market and token: one market held in two tokens is
                  // two rows, and they share an id.
                  <div key={rowKey(bet.id, bet.token)} className="ab-row">
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
                          {formatAmount(bet.stakeAmount, bet.token)} {symbol(bet.token)} staked
                        </span>
                        {archived && <ArchivedTag />}
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
                          <span className="ab-odds-note">
                            {formatAmount(pool, bet.token)} {symbol(bet.token)} in the pool
                          </span>
                        </>
                      )}
                    </div>

                    <div
                      className={`ab-clock${clock.ended ? ' ab-clock--ended' : clock.soon ? ' ab-clock--soon' : ''}`}
                    >
                      {bet.status === 'pending' ? 'Not settled' : clock.text}
                      <span className="ab-clock-sub">
                        {archived
                          ? 'no payout, nobody can resolve it'
                          : `${formatAmount(bet.potentialPayout, bet.token)} ${symbol(bet.token)} if it lands`}
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
          <p className="sheet-rail-meta">
            {`What is riding\non these ${shown.length}`}
          </p>
        </div>
        <div>
          {exposure.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing at stake</strong>
              With no open position there is nothing to add up.
            </div>
          ) : (
            <div className="ab-exposure">
              {exposure.map((total) => (
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
                      <span className="sheet-settle-key">At stake</span>
                      <span className="sheet-settle-val">
                        {formatAmount(total.staked, total.token)} {symbol(total.token)}
                      </span>
                    </div>
                    <div className="sheet-settle-row sheet-settle-row--total">
                      <span className="sheet-settle-key">Upside if every one lands</span>
                      <span className="sheet-settle-val">
                        {formatSigned(total.profit, total.token)} {symbol(total.token)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

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
