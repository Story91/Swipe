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
  rowKey,
  type TokenTotal,
} from './portfolioTokens';
import { StaleNotice, ArchivedNote, ArchivedTag } from './PortfolioNotes';
import { CreatorRewards } from './CreatorRewards';
import { Refunds } from './Refunds';
import '../../styles/sheet.css';
import './MyPortfolio.css';

/**
 * Portfolio, on the shared sheet.
 *
 * Data comes from /api/portfolio through usePortfolio, which sends the active
 * chain and keeps the last good answer when a read fails.
 *
 * Every figure carries the token it is in. A position can be in ETH, in $SWIPE
 * or in the chain's collateral, and the three cannot be added: they are stored
 * raw, one wei of ETH is a million times finer than one unit of a six decimal
 * stablecoin, and the sum is dominated by whichever leg is denominated in wei.
 * So the standing is one ledger per token and there is no grand total anywhere
 * on this screen.
 *
 * Two panels sit outside the ledger, because they are about money the contract
 * is holding rather than about how a book has performed. Refunds covers markets
 * nobody settled, where the contract lets anyone open refunds thirty days past
 * the deadline. CreatorRewards covers the cut a market creator earns, which the
 * contract credits at resolution and never sends on its own. Both render null
 * when there is nothing owed, which is the usual case, so they cost a reader
 * with an ordinary book nothing.
 */

type Tab = 'overview' | 'active' | 'history';

/** One token's ledger: the whole book, then the settled half, then the open half. */
interface Standing extends TokenTotal {
  settled?: TokenTotal;
  open?: TokenTotal;
}

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

const isOpen = (row: PortfolioRow) => row.status === 'active' || row.status === 'pending';
const isSettled = (row: PortfolioRow) => row.status === 'won' || row.status === 'lost';

export function MyPortfolio() {
  const { address } = useAccount();
  // chainKey travels with the read and comes back out of the hook, because the
  // symbol beside every figure depends on it: the collateral leg is stored as
  // 'USDC' on every chain and is USDG on Robinhood.
  const { chainKey, rows, loading, error, refresh } = usePortfolio(address);

  const symbol = (token: StakeToken | undefined) => symbolFor(token, chainKey);

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const items = useMemo(() => rows ?? [], [rows]);

  /**
   * The ledger, per token.
   *
   * Built from the rows rather than from the route's `stats`, which carries the
   * same numbers. One source means the ledger and the list below it cannot
   * disagree, and the route's headline is the collateral leg alone, which would
   * have printed 0.00 USDC to somebody whose whole book is in ETH.
   */
  const standings: Standing[] = useMemo(() => {
    const settled = new Map(totalsByToken(items.filter(isSettled)).map((t) => [t.token, t]));
    const open = new Map(totalsByToken(items.filter(isOpen)).map((t) => [t.token, t]));
    return totalsByToken(items).map((total) => ({
      ...total,
      settled: settled.get(total.token),
      open: open.get(total.token),
    }));
  }, [items]);

  const counts = useMemo(() => {
    const won = items.filter((i) => i.status === 'won').length;
    const lost = items.filter((i) => i.status === 'lost').length;
    return {
      open: items.filter(isOpen).length,
      settled: won + lost,
      won,
      lost,
      winRate: won + lost > 0 ? (won / (won + lost)) * 100 : null,
    };
  }, [items]);

  const filteredItems = items.filter((item) => {
    switch (activeTab) {
      case 'active':
        return isOpen(item);
      case 'history':
        return isSettled(item);
      default:
        return true;
    }
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Everything' },
    { key: 'active', label: `Open (${counts.open})` },
    { key: 'history', label: `Settled (${counts.settled})` },
  ];

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Portfolio</p>
              <h1 className="sheet-hero-title">
                Your <em>book</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Every position you have taken, what it cost and what it returned.
            Each row is one market in one token, so a market you backed twice
            shows up twice. Profit is what you took out of losing pools, net of
            your own losing stakes.
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
            Connect a wallet and this fills with whatever it has staked.
          </div>
        </div>
      </section>
    );
  }

  // Loading and failure states are only allowed to take the whole screen while
  // there is nothing to take it from. Once rows have been read, a slow or
  // failed refresh is a note above them, not a replacement for them.
  if (rows === null && loading) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading your positions</strong>
            Matching stakes against settled markets.
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
            <strong>Could not read your book</strong>
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
      {/* Money the contract is holding for you, above the book rather than in
          it. Both panels render nothing at all when there is nothing owed, so
          for almost everybody this page looks exactly as it did. */}
      <Refunds rows={items} onChanged={refresh} />

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Standing</p>
          <p className="sheet-rail-meta">{`One ledger\nper token`}</p>
        </div>
        <div>
          {error && <StaleNotice error={error} onRetry={refresh} />}

          {standings.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing staked yet</strong>
              Back a side on a market and its ledger appears here.
            </div>
          ) : (
            <div className="pf-standings">
              {standings.map((standing) => (
                <div key={standing.token} className="sheet-board">
                  <div className="sheet-board-head">
                    <h2 className="sheet-board-title">
                      {symbol(standing.token)}
                      {isArchivedLeg(standing.token) ? ', archived' : ''}
                    </h2>
                    <p className="sheet-board-meta">
                      {standing.count} {standing.count === 1 ? 'position' : 'positions'}
                    </p>
                  </div>
                  <div className="sheet-settle">
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Staked in total</span>
                      <span className="sheet-settle-val">
                        {formatAmount(standing.staked, standing.token)} {symbol(standing.token)}
                      </span>
                    </div>
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Still open</span>
                      <span className="sheet-settle-val">
                        {formatAmount(standing.open?.staked ?? 0, standing.token)}{' '}
                        {symbol(standing.token)}
                        <span className="sheet-settle-sub">
                          {standing.open?.count ?? 0} not settled
                        </span>
                      </span>
                    </div>
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">If the open ones all land</span>
                      <span className="sheet-settle-val">
                        {formatSigned(standing.open?.profit ?? 0, standing.token)}{' '}
                        {symbol(standing.token)}
                      </span>
                    </div>
                    <div className="sheet-settle-row sheet-settle-row--total">
                      <span className="sheet-settle-key">Settled, profit and loss</span>
                      <span className="sheet-settle-val">
                        {formatSigned(standing.settled?.profit ?? 0, standing.token)}{' '}
                        {symbol(standing.token)}
                        <span className="sheet-settle-sub">
                          across {standing.settled?.count ?? 0}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {standings.some((s) => isArchivedLeg(s.token)) && <ArchivedNote />}

              <div className="sheet-board">
                <div className="sheet-board-head">
                  <h2 className="sheet-board-title">Calls</h2>
                  <p className="sheet-board-meta">Every token</p>
                </div>
                <div className="sheet-settle">
                  <div className="sheet-settle-row">
                    <span className="sheet-settle-key">Settled</span>
                    <span className="sheet-settle-val">{counts.settled}</span>
                  </div>
                  <div className="sheet-settle-row">
                    <span className="sheet-settle-key">Still open</span>
                    <span className="sheet-settle-val">{counts.open}</span>
                  </div>
                  <div className="sheet-settle-row sheet-settle-row--total">
                    <span className="sheet-settle-key">Called right</span>
                    <span className="sheet-settle-val">
                      {counts.winRate === null ? 'nothing settled' : `${counts.winRate.toFixed(1)}%`}
                      <span className="sheet-settle-sub">
                        {counts.won} won, {counts.lost} lost
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <CreatorRewards />

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
          <p className="sheet-rail-meta">
            {`${filteredItems.length} shown\nof ${items.length}`}
          </p>
        </div>
        <div>
          <div className="pf-tabs">
            <div className="sheet-segment" role="group" aria-label="Which positions to show">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="sheet-segment-item"
                  aria-pressed={activeTab === t.key}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* No archived note here. The standing above carries it, and the same
              paragraph twice on one page reads as a template rather than a
              warning. Each row that needs it carries the tag. */}
          {filteredItems.length === 0 ? (
            <div className="sheet-empty">
              <strong>
                {activeTab === 'active'
                  ? 'Nothing open'
                  : activeTab === 'history'
                    ? 'Nothing settled yet'
                    : 'No positions'}
              </strong>
              {activeTab === 'active'
                ? 'Positions you are still holding will appear here.'
                : activeTab === 'history'
                  ? 'Once a market you backed resolves, it lands here with what it paid.'
                  : 'Back a side on a market and it shows up here.'}
            </div>
          ) : (
            <div className="pf-list">
              <div className="pf-head" aria-hidden="true">
                <span />
                <span>Market</span>
                <span>Stake</span>
                <span>Result</span>
              </div>

              {filteredItems.map((item) => {
                const settled = isSettled(item);
                const archived = isArchivedLeg(item.token);
                return (
                  // Keyed on the market and the token. Two rows can share an id,
                  // because a market backed in two tokens is two positions.
                  <div key={rowKey(item.id, item.token)} className="pf-row">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="pf-thumb" src={item.imageUrl} alt="" />
                    ) : (
                      <span className="pf-thumb" />
                    )}

                    <div className="pf-main">
                      <div className="pf-question">{item.question}</div>
                      <div className="pf-sub">
                        {item.category && (
                          <span className="pf-category">{item.category}</span>
                        )}
                        <span className={`pf-side pf-side--${item.choice === 'YES' ? 'yes' : 'no'}`}>
                          {item.choice}
                        </span>
                        <span className={`pf-status pf-status--${item.status}`}>
                          {item.status}
                        </span>
                        <span className="pf-age">{timeAgo(item.createdAt)}</span>
                        {archived && <ArchivedTag />}
                      </div>
                    </div>

                    <div className="pf-figures">
                      <div>
                        <span className="pf-figure-label">Stake</span>
                        <span className="pf-figure">
                          {formatAmount(item.stakeAmount, item.token)} {symbol(item.token)}
                        </span>
                      </div>

                      <div>
                        <span className="pf-figure-label">
                          {settled ? 'Result' : 'If it lands'}
                        </span>
                        {settled ? (
                          <span
                            className={`pf-figure ${item.profit >= 0 ? 'pf-figure--gain' : 'pf-figure--loss'}`}
                          >
                            {formatSigned(item.profit, item.token)} {symbol(item.token)}
                          </span>
                        ) : (
                          <span className="pf-figure">
                            {formatAmount(item.potentialPayout, item.token)} {symbol(item.token)}
                            <span className="pf-figure-sub">
                              {archived ? 'if it could settle' : 'if it lands'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
