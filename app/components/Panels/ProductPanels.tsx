'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { useProductPanelData, type ActivityItem } from './useProductPanelData';
import './ProductPanels.css';

/**
 * Product content shared by two surfaces:
 *   layout="bar"  - a horizontal strip above the market grid
 *   layout="rail" - a vertical stack inside the desktop side panels
 *
 * One implementation, two arrangements, so the two surfaces cannot drift apart.
 */

type Layout = 'bar' | 'rail';

function formatEth(wei: number): string {
  const eth = wei / 1e18;
  if (!eth) return '0';
  if (eth < 0.001) return '<0.001';
  if (eth < 1) return eth.toFixed(3);
  return eth.toFixed(2);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const ACTIVITY_LABEL: Record<string, string> = {
  prediction_resolved: 'resolved',
  stake_placed: 'staked on',
  reward_claimed: 'claimed on',
  prediction_created: 'created',
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const who = item.user?.displayName || 'Someone';
  const verb = ACTIVITY_LABEL[item.type] ?? item.type.replace(/_/g, ' ');
  const what = item.prediction?.question;

  return (
    <li className="pp-activity__row">
      <span className="pp-activity__avatar" aria-hidden="true">
        {item.user?.avatar || '•'}
      </span>
      <span className="pp-activity__text">
        <span className="pp-activity__who">{who}</span> {verb}
        {what ? <span className="pp-activity__what"> “{what}”</span> : null}
      </span>
      <time className="pp-activity__when">{timeAgo(item.timestamp)}</time>
    </li>
  );
}

export function ProductPanels({ layout }: { layout: Layout }) {
  const { address } = useAccount();
  const { stats, activity, claimCount, loading } = useProductPanelData(address);

  if (loading && !stats) {
    return <div className={`pp pp--${layout} pp--loading`} aria-busy="true" />;
  }

  const activityLimit = layout === 'bar' ? 3 : 6;

  return (
    <div className={`pp pp--${layout}`}>
      {claimCount !== null && claimCount > 0 && (
        <section className="pp-card pp-card--claim">
          <h3 className="pp-card__title">Ready to claim</h3>
          <p className="pp-claim__count">{claimCount}</p>
          <p className="pp-card__sub">
            {claimCount === 1 ? 'market' : 'markets'} waiting for you
          </p>
        </section>
      )}

      {stats && (
        <section className="pp-card">
          <h3 className="pp-card__title">Market</h3>
          <dl className="pp-stats">
            <div>
              <dt>Markets</dt>
              <dd>{formatCount(stats.totalPredictions)}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{formatCount(stats.activePredictions)}</dd>
            </div>
            <div>
              <dt>Players</dt>
              <dd>{formatCount(stats.totalParticipants)}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{formatEth(stats.totalVolumeETH)} ETH</dd>
            </div>
          </dl>
        </section>
      )}

      {activity.length > 0 && (
        <section className="pp-card pp-card--activity">
          <h3 className="pp-card__title">Recent activity</h3>
          <ul className="pp-activity">
            {activity.slice(0, activityLimit).map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ProductPanels;
