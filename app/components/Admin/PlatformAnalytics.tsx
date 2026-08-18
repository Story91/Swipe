"use client";

import React, { useState, useEffect } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains/types';
import { COLLATERAL_LEG, toDisplayUnits, tokenSymbol } from '@/lib/userStake';
import '../../styles/sheet.css';
import './PlatformAnalytics.css';

/**
 * Platform analytics, on the shared sheet.
 *
 * Three fabrications are gone, which matters more here than on most screens
 * because these are the numbers an operator makes decisions on.
 *
 * `dailyStats` was a hardcoded week of 2024-08-20 to 2024-08-26, rendered as
 * recent activity. Deleted. A real rolling week is counted off the markets
 * instead, and labelled for what it is.
 *
 * Category volume was `Math.random() * 100 + 50`, so the bar chart reshuffled
 * itself on every 60s refresh. Categories now show the count they actually
 * have, which is the only figure the endpoint reports per category.
 *
 * The hardcoded fallback list (Crypto 45, Sports 23, ...) that stood in when
 * the API returned no categories is gone too; an empty breakdown now says so.
 *
 * Also fixed: `resolutionRate` arrives from the API already multiplied to a
 * percentage, and the component multiplied it by 100 again, so a 45%
 * resolution rate displayed as 4500%.
 *
 * The time-range selector was removed rather than restyled. It set state that
 * nothing read: the fetch had an empty dependency array and never sent the
 * range, so all three options showed identical numbers.
 *
 * And the money was fiction in a fourth way. Three rows printed a figure with
 * ETH after it. `totalVolume` and `collectedFees` are not fields the stats
 * snapshot has ever carried, so both read undefined and rendered 0.0000 ETH
 * forever. The other two, average stake and last week's staked, came from
 * `totalStakes`, which lib/redis writes as `participants.length`. That is a
 * head count. The page was putting a currency after it.
 *
 * The pools are read from the markets instead, in the collateral the chain
 * actually settles in, named from lib/chains. Nothing is summed across tokens:
 * a raw ETH pool is 1e18 and a raw collateral pool is 1e6, so one added total
 * is just the wei leg wearing a dollar sign.
 */

interface Analytics {
  totalPredictions: number;
  activePredictions: number;
  resolutionRate: number;
  topCategories: Array<{ name: string; count: number }>;
  endingSoon: number;
  marketsLast7Days: number;
  lastUpdated: string | null;
  /** Whichever stablecoin this chain settles in. USDC on Base, USDG on Robinhood. */
  symbol: string;
  /** Readable units, collateral only. */
  pooled: number;
  pooledLast7Days: number;
  averagePerBettor: number;
  bettors: number;
  bettorsLast7Days: number;
}

/** The fields this page reads off a stored market. */
interface StatsPrediction {
  createdAt?: number;
  usdcYesTotalAmount?: number;
  usdcNoTotalAmount?: number;
  usdcParticipants?: string[];
}

const num = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');

/** An amount of collateral, with the chain's own name for it. */
const money = (n: number, symbol: string) =>
  `${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;

const WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * What is actually staked, counted off the markets.
 *
 * One pass, because the seven day figures and the all time ones want the same
 * fields and the list is a few hundred long. Only the collateral pair is read:
 * `yesTotalAmount` and its SWIPE twin belong to the archived contracts and are
 * in wei, and adding them here would produce a number in no unit at all.
 *
 * The bettor set is `usdcParticipants` for the same reason the pools are. The
 * `participants` array the snapshot counts is the V2 one, so its total misses
 * everybody who has bet since.
 */
function collateralFrom(predictions: StatsPrediction[], chainKey: ChainKey) {
  const cutoff = Math.floor(Date.now() / 1000) - WEEK_SECONDS;

  let raw = 0;
  let rawLast7Days = 0;
  let marketsLast7Days = 0;
  const bettors = new Set<string>();
  const recentBettors = new Set<string>();

  for (const p of predictions) {
    const pool = (p.usdcYesTotalAmount ?? 0) + (p.usdcNoTotalAmount ?? 0);
    const recent = (p.createdAt ?? 0) > cutoff;

    raw += pool;
    if (recent) {
      rawLast7Days += pool;
      marketsLast7Days += 1;
    }

    for (const address of p.usdcParticipants ?? []) {
      const key = address.toLowerCase();
      bettors.add(key);
      if (recent) recentBettors.add(key);
    }
  }

  const pooled = toDisplayUnits(raw, COLLATERAL_LEG);

  return {
    symbol: tokenSymbol(COLLATERAL_LEG, chainKey),
    pooled,
    pooledLast7Days: toDisplayUnits(rawLast7Days, COLLATERAL_LEG),
    bettors: bettors.size,
    bettorsLast7Days: recentBettors.size,
    marketsLast7Days,
    averagePerBettor: bettors.size > 0 ? pooled / bettors.size : 0,
  };
}

export function PlatformAnalytics() {
  // The active chain travels with every read below. The server defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, so without this a user on Robinhood sees Base's numbers.
  const { chainKey } = useActiveChain();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Two reads, in parallel. The snapshot has the counts and the
        // categories; it has no money in it, so the pools come from the
        // markets themselves.
        const [statsResponse, marketsResponse] = await Promise.all([
          fetch(`/api/market/stats?chain=${chainKey}`),
          fetch(`/api/predictions?chain=${chainKey}`),
        ]);
        if (!statsResponse.ok) {
          throw new Error(`HTTP error! status: ${statsResponse.status}`);
        }
        if (!marketsResponse.ok) {
          throw new Error(`HTTP error! status: ${marketsResponse.status}`);
        }

        const result = await statsResponse.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch analytics');
        }

        const markets = await marketsResponse.json();
        if (!markets.success) {
          throw new Error(markets.error || 'Failed to fetch markets');
        }

        const s = result.data;
        const pools = collateralFrom(
          (markets.data ?? []) as StatsPrediction[],
          chainKey
        );

        setData({
          totalPredictions: s.totalPredictions ?? 0,
          activePredictions: s.activePredictions ?? 0,
          // Already a percentage on the way out of the API. Do not scale again.
          resolutionRate: s.performance?.resolutionRate ?? 0,
          topCategories:
            s.categories?.topCategories?.map((c: { category: string; count: number }) => ({
              name: c.category,
              count: c.count,
            })) ?? [],
          endingSoon: s.timeBased?.predictionsEndingSoon ?? 0,
          lastUpdated: result.lastUpdated ?? null,
          ...pools,
        });
      } catch (err) {
        console.error('❌ Failed to fetch analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchAnalytics, 60000);
    return () => clearInterval(interval);
  }, [chainKey]);

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Analytics</p>
              <h1 className="sheet-hero-title">
                The platform, <em>counted</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Everything here is read from the markets themselves. Where a figure
            is not collected, this page says so rather than estimating it.
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
          <p className="sheet-eyebrow">Totals</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Counting</strong>
            Aggregating markets, stakes and participants.
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Totals</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load analytics</strong>
            {error ?? 'No data returned.'}
          </div>
        </div>
      </section>
    );
  }

  const largestCategory = data.topCategories[0]?.count ?? 0;

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">All time</p>
          <p className="sheet-rail-meta">{`Every market\never opened`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Markets</span>
                <span className="sheet-settle-val">
                  {num(data.totalPredictions)}
                  <span className="sheet-settle-sub">
                    {num(data.activePredictions)} still open
                  </span>
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Bettors</span>
                <span className="sheet-settle-val">{num(data.bettors)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Average per bettor</span>
                <span className="sheet-settle-val">
                  {money(data.averagePerBettor, data.symbol)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Resolved</span>
                <span className="sheet-settle-val">{data.resolutionRate.toFixed(1)}%</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">In the pools</span>
                <span className="sheet-settle-val">
                  {money(data.pooled, data.symbol)}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              This is what is sitting in the pools right now, in {data.symbol},
              not lifetime volume. Money that left through an early exit is not
              in it. Bets made in ETH or SWIPE are not in it either: those pools
              are on archived contracts, they are denominated in wei, and adding
              them to a six decimal figure would give a number in no unit at
              all.
            </p>
          </div>
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Last 7 days</p>
          <p className="sheet-rail-meta">{`Rolling window,\nnot a fixed week`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Markets opened</span>
                <span className="sheet-settle-val">{num(data.marketsLast7Days)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Bettors in them</span>
                <span className="sheet-settle-val">
                  {num(data.bettorsLast7Days)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Closing within a day</span>
                <span className="sheet-settle-val">{num(data.endingSoon)}</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Staked in them</span>
                <span className="sheet-settle-val">
                  {money(data.pooledLast7Days, data.symbol)}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              Every row here is about markets opened this week, not about bets
              placed this week. Nothing records when a bet was placed, so a bet
              made today on a market opened a month ago sits in the all time
              figures above and nowhere in this block.
            </p>
            <p>
              There is no day-by-day trend either, because none is recorded. The
              chart that used to sit in this spot was a fixed week of hardcoded
              2024 figures that never changed.
            </p>
          </div>
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Categories</p>
          <p className="sheet-rail-meta">{`By market count,\nlargest first`}</p>
        </div>
        <div>
          {data.topCategories.length === 0 ? (
            <div className="sheet-empty">
              <strong>No categories reported</strong>
              Markets carry no category data in this snapshot.
            </div>
          ) : (
            <div className="pa-cats">
              {data.topCategories.map(cat => (
                <div className="pa-cat" key={cat.name}>
                  <div className="pa-cat-top">
                    <span className="pa-cat-name">{cat.name}</span>
                    <span className="pa-cat-count">
                      {num(cat.count)} market{cat.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="pa-cat-track">
                    <div
                      className="pa-cat-fill"
                      style={{
                        ['--pa-share' as string]:
                          largestCategory > 0 ? cat.count / largestCategory : 0,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sheet-note">
            <p>
              Bars compare how many markets a category has, not how much is in
              them. Per-category volume is not collected; the figure that used
              to appear here was randomly generated and reshuffled on every
              refresh.
            </p>
          </div>
        </div>
      </section>

      {data.lastUpdated && (
        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">Freshness</p>
          </div>
          <div>
            <p className="sheet-p">
              Snapshot last written{' '}
              <span className="sheet-data">
                {new Date(data.lastUpdated).toLocaleString()}
              </span>
              . These figures come from that snapshot rather than a live chain
              read, so they lag it by however long ago it ran.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
