"use client";

import React, { useState, useEffect } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import '../../styles/sheet.css';
import './PlatformAnalytics.css';

/**
 * Platform analytics, on the shared sheet.
 *
 * Three fabrications are gone, which matters more here than on most screens
 * because these are the numbers an operator makes decisions on.
 *
 * `dailyStats` was a hardcoded week of 2024-08-20 to 2024-08-26, rendered as
 * recent activity. Deleted. /api/market/stats does carry a genuine last-seven-
 * days block, so that is shown instead and labelled for what it is.
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
 */

interface Analytics {
  totalPredictions: number;
  activePredictions: number;
  totalVolume: number;
  totalParticipants: number;
  averageStake: number;
  platformFees: number;
  resolutionRate: number;
  topCategories: Array<{ name: string; count: number }>;
  last7Days: {
    predictions: number;
    stakes: number;
    newParticipants: number;
  };
  endingSoon: number;
  lastUpdated: string | null;
}

const num = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');
const eth = (n: number | undefined, dp = 4) => `${(n ?? 0).toFixed(dp)} ETH`;

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

        const response = await fetch(`/api/market/stats?chain=${chainKey}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch analytics');
        }

        const s = result.data;
        setData({
          totalPredictions: s.totalPredictions ?? 0,
          activePredictions: s.activePredictions ?? 0,
          totalVolume: s.totalVolume ?? 0,
          totalParticipants: s.totalParticipants ?? 0,
          averageStake: s.performance?.averageStakeSize ?? 0,
          platformFees: s.collectedFees ?? 0,
          // Already a percentage on the way out of the API. Do not scale again.
          resolutionRate: s.performance?.resolutionRate ?? 0,
          topCategories:
            s.categories?.topCategories?.map((c: { category: string; count: number }) => ({
              name: c.category,
              count: c.count,
            })) ?? [],
          last7Days: {
            predictions: s.recentActivity?.predictionsLast7Days ?? 0,
            stakes: s.recentActivity?.totalStakesLast7Days ?? 0,
            newParticipants: s.recentActivity?.newParticipantsLast7Days ?? 0,
          },
          endingSoon: s.timeBased?.predictionsEndingSoon ?? 0,
          lastUpdated: result.lastUpdated ?? null,
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
  }, []);

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
                <span className="sheet-settle-key">Participants</span>
                <span className="sheet-settle-val">{num(data.totalParticipants)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Average stake</span>
                <span className="sheet-settle-val">{eth(data.averageStake)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Resolved</span>
                <span className="sheet-settle-val">{data.resolutionRate.toFixed(1)}%</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Volume</span>
                <span className="sheet-settle-val">{eth(data.totalVolume)}</span>
              </div>
            </div>
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
                <span className="sheet-settle-val">{num(data.last7Days.predictions)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">New participants</span>
                <span className="sheet-settle-val">{num(data.last7Days.newParticipants)}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Closing within a day</span>
                <span className="sheet-settle-val">{num(data.endingSoon)}</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Staked</span>
                <span className="sheet-settle-val">{eth(data.last7Days.stakes)}</span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              There is no day-by-day trend here because none is recorded. The
              chart that used to sit in this spot was a fixed week of{' '}
              <strong>hardcoded 2024 figures</strong> that never changed.
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
              Bars compare market <strong>count</strong>, not volume. Per-category
              volume is not collected; the figure that used to appear here was
              randomly generated and reshuffled on every refresh.
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
