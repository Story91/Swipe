"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import { tokenSymbol, COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';
import '../../styles/sheet.css';
import './MyPortfolio.css';

/**
 * Portfolio, on the shared sheet.
 *
 * Data comes from /api/portfolio. Every figure carries the token it is in,
 * because a position can be in ETH, in SWIPE, or in the chain's collateral, and
 * the three cannot be added together: they are stored raw and one wei of ETH is
 * a million times finer than one unit of a six decimal stablecoin.
 */

interface PortfolioStats {
  totalInvested: number;
  totalPayout: number;
  totalProfit: number;
  /**
   * Which token the three figures above are in.
   *
   * They were labelled ETH in the markup, unconditionally. The route now sends
   * the collateral totals, so the label has to come from the data or the panel
   * calls a dollar an ether.
   */
  totalsToken?: StakeToken;
  activeBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
}

interface PortfolioItem {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  /** A market can be held in more than one token, so a row names its own. */
  token?: StakeToken;
  choice: 'YES' | 'NO';
  status: 'active' | 'won' | 'lost' | 'pending';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
}

type Tab = 'overview' | 'active' | 'history';

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

export function MyPortfolio() {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const { address } = useAccount();

  // What to print beside a figure. The leg is stored as 'USDC' on every chain,
  // so on Robinhood the symbol has to come from the chain, not from the leg.
  const symbolFor = (token: StakeToken | undefined) =>
    tokenSymbol(token ?? COLLATERAL_LEG, chainKey);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [stats, setStats] = useState<PortfolioStats>({
    totalInvested: 0,
    totalPayout: 0,
    totalProfit: 0,
    activeBets: 0,
    wonBets: 0,
    lostBets: 0,
    winRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortfolio = async () => {
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
          const { portfolio, stats: portfolioStats } = result.data;
          setPortfolioItems(portfolio);
          setStats(portfolioStats);
        } else {
          throw new Error(result.error || 'Failed to fetch portfolio');
        }
      } catch (err) {
        console.error('❌ Failed to fetch portfolio:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch portfolio data');
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, [address, chainKey]);

  const filteredItems = portfolioItems.filter(item => {
    switch (activeTab) {
      case 'active':
        return item.status === 'active' || item.status === 'pending';
      case 'history':
        return item.status === 'won' || item.status === 'lost';
      default:
        return true;
    }
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Everything' },
    { key: 'active', label: `Open (${stats.activeBets})` },
    { key: 'history', label: `Settled (${stats.wonBets + stats.lostBets})` },
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

  if (loading) {
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

  if (error) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load your book</strong>
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
          <p className="sheet-eyebrow">Standing</p>
          <p className="sheet-rail-meta">{`Across every\nposition`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Staked</span>
                <span className="sheet-settle-val">
                  {stats.totalInvested.toFixed(4)} {symbolFor(stats.totalsToken)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Returned</span>
                <span className="sheet-settle-val">
                  {stats.totalPayout.toFixed(4)} {symbolFor(stats.totalsToken)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Win rate</span>
                <span className="sheet-settle-val">
                  {stats.winRate.toFixed(1)}%
                  <span className="sheet-settle-sub">
                    {stats.wonBets} won, {stats.lostBets} lost
                  </span>
                </span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Profit and loss</span>
                <span className="sheet-settle-val">
                  {signed(stats.totalProfit)} {symbolFor(stats.totalsToken)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Positions</p>
          <p className="sheet-rail-meta">
            {`${filteredItems.length} shown\nof ${portfolioItems.length}`}
          </p>
        </div>
        <div>
          <div className="pf-tabs">
            <div className="sheet-segment" role="group" aria-label="Which positions to show">
              {TABS.map(t => (
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

              {filteredItems.map(item => {
                const settled = item.status === 'won' || item.status === 'lost';
                return (
                  <div key={item.id} className="pf-row">
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
                      </div>
                    </div>

                    <div className="pf-figures">
                      <div>
                        <span className="pf-figure-label">Stake</span>
                        <span className="pf-figure">{item.stakeAmount.toFixed(4)} {symbolFor(item.token)}</span>
                      </div>

                      <div>
                        <span className="pf-figure-label">
                          {settled ? 'Result' : 'If it lands'}
                        </span>
                        {settled ? (
                          <span
                            className={`pf-figure ${item.profit >= 0 ? 'pf-figure--gain' : 'pf-figure--loss'}`}
                          >
                            {signed(item.profit)} {symbolFor(item.token)}
                          </span>
                        ) : (
                          <span className="pf-figure">
                            {item.potentialPayout.toFixed(4)} {symbolFor(item.token)}
                            <span className="pf-figure-sub">if it lands</span>
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
