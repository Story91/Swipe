"use client";

import React from 'react';
import { formatInstant, relativeTime, shortAddress, type AdminMarket } from './adminMarkets';

/**
 * One proposal, with the single button that turns it into a market.
 *
 * Everything on the card is a thing the operator has to know before pressing
 * it: the question as written, who gets credited as creator and therefore paid
 * the creator fee, when it closes, and the market number the registration will
 * take. Registering is `onlyRegistrar` and irreversible in the sense that the
 * number is then spent, so the card shows the number rather than leaving it to
 * be inferred from the id.
 */

interface ProposalCardProps {
  market: AdminMarket;
  /** Unix seconds, from the parent's tick, so every card agrees on the time. */
  now: number;
  /** Explorer link for the creator, or null when the chain has no market. */
  creatorUrl: string | null;
  /** This row is waiting on a wallet or a receipt. */
  busy: boolean;
  /** Some other row is working, or there is nothing to write to. */
  disabled: boolean;
  onRegister: (market: AdminMarket) => void;
}

export function ProposalCard({
  market,
  now,
  creatorUrl,
  busy,
  disabled,
  onRegister,
}: ProposalCardProps) {
  const creator = shortAddress(market.creator);
  const readable = market.number !== null;
  // A proposal can sit here long enough to go stale, and registering a market
  // whose deadline has gone leaves you with one to settle for nobody.
  const stale = market.deadline <= now;

  return (
    <article className="sheet-board">
      <div className="sheet-board-head">
        <h3 className="sheet-board-title">
          {readable ? `Market ${market.number}` : 'Unreadable id'}
        </h3>
        <p className="sheet-board-meta">Proposed {relativeTime(market.createdAt, now)}</p>
      </div>

      <p className="adm-question">{market.question}</p>

      <div className="sheet-settle">
        <div className="sheet-settle-row">
          <span className="sheet-settle-key">Creator, paid the creator fee</span>
          <span className="sheet-settle-val adm-mono">
            {creatorUrl ? (
              <a className="adm-link" href={creatorUrl} target="_blank" rel="noreferrer">
                {creator}
              </a>
            ) : (
              creator
            )}
          </span>
        </div>
        <div className="sheet-settle-row">
          <span className="sheet-settle-key">{stale ? 'Closed already' : 'Closes'}</span>
          <span className="sheet-settle-val">
            {formatInstant(market.deadline)}
            <span className="sheet-settle-sub">{relativeTime(market.deadline, now)}</span>
          </span>
        </div>
        <div className="sheet-settle-row sheet-settle-row--total">
          <span className="sheet-settle-key">Takes market number</span>
          <span className="sheet-settle-val">{readable ? market.number : 'cannot tell'}</span>
        </div>
      </div>

      {stale && (
        <div className="adm-warn">
          <p>
            The deadline has gone. Register this and you get a market nobody can bet on, which
            you then have to cancel.
          </p>
        </div>
      )}

      <div className="adm-actions">
        <button
          type="button"
          className="sheet-action adm-action adm-action--go"
          disabled={disabled || busy || !readable}
          onClick={() => onRegister(market)}
        >
          {busy && <span className="adm-busy">Waiting for the receipt</span>}
          {!busy && readable && `Register market ${market.number}`}
          {!busy && !readable && 'Nothing to register'}
        </button>
      </div>
    </article>
  );
}
