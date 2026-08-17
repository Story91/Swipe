"use client";

import React from 'react';
import {
  formatInstant,
  formatPool,
  relativeTime,
  settlesOnChain,
  type AdminMarket,
} from './adminMarkets';

/**
 * One registered market, with the decisions it is waiting for.
 *
 * Past its deadline it needs an outcome, so it gets three buttons. Before its
 * deadline the only thing an operator should ever do is kill a market that
 * should not have run, so it gets one. Resolving pays out and cancelling makes
 * every stake refundable, and both are irreversible, which is why the labels
 * say what happens rather than naming the contract call.
 */

interface MarketCardProps {
  market: AdminMarket;
  now: number;
  /** Deadline has gone, so this one is waiting on an outcome. */
  overdue: boolean;
  /** The collateral this chain's market holds, USDC on Base and USDG on Robinhood. */
  symbol: string;
  decimals: number;
  busy: boolean;
  disabled: boolean;
  onResolve: (market: AdminMarket, outcome: boolean) => void;
  onCancel: (market: AdminMarket) => void;
}

export function MarketCard({
  market,
  now,
  overdue,
  symbol,
  decimals,
  busy,
  disabled,
  onResolve,
  onCancel,
}: MarketCardProps) {
  const onChain = settlesOnChain(market);
  const readable = market.number !== null;
  const locked = disabled || busy || !readable;

  return (
    <article className="sheet-board">
      <div className="sheet-board-head">
        <h3 className="sheet-board-title">
          {readable ? `Market ${market.number}` : 'Unreadable id'}
        </h3>
        <p className="sheet-board-meta">
          {overdue
            ? `Closed ${relativeTime(market.deadline, now)}`
            : `Closes ${relativeTime(market.deadline, now)}`}
        </p>
      </div>

      <p className="adm-question">{market.question}</p>

      <div className="sheet-settle">
        <div className="sheet-settle-row">
          <span className="sheet-settle-key">Pooled</span>
          <span className="sheet-settle-val">
            {onChain ? `${formatPool(market.pool, decimals)} ${symbol}` : 'not on a contract'}
            <span className="sheet-settle-sub">
              {market.participants} {market.participants === 1 ? 'backer' : 'backers'}
            </span>
          </span>
        </div>
        <div className="sheet-settle-row">
          <span className="sheet-settle-key">Deadline</span>
          <span className="sheet-settle-val">{formatInstant(market.deadline)}</span>
        </div>
        {!onChain && (
          <div className="sheet-settle-row">
            <span className="sheet-settle-key">Settles</span>
            <span className="sheet-settle-val">
              in Redis
              <span className="sheet-settle-sub">this one predates the contracts</span>
            </span>
          </div>
        )}
      </div>

      <div className="adm-actions">
        {overdue && (
          <>
            <button
              type="button"
              className="sheet-action adm-action adm-action--go"
              disabled={locked}
              onClick={() => onResolve(market, true)}
            >
              {busy ? <span className="adm-busy">Working</span> : 'It happened, pay yes'}
            </button>
            <button
              type="button"
              className="sheet-action adm-action"
              disabled={locked}
              onClick={() => onResolve(market, false)}
            >
              It did not, pay no
            </button>
          </>
        )}
        <button
          type="button"
          className="sheet-action adm-action adm-action--stop"
          disabled={locked}
          onClick={() => onCancel(market)}
        >
          Cancel and refund
        </button>
      </div>
    </article>
  );
}
