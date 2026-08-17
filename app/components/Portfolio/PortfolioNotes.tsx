'use client';

import React from 'react';
import './PortfolioNotes.css';

/**
 * Two sentences the portfolio screens all have to say, written once.
 *
 * Both are about the difference between an absence and a fact. A refresh that
 * failed is not an empty book, and a position on a dead contract is not a
 * position that is about to pay.
 */

/**
 * Shown above rows that are still on screen after a read failed.
 *
 * The rows themselves stay. What changes is that the screen stops implying they
 * are current, and offers the read again rather than waiting out the 30 second
 * timer.
 */
export function StaleNotice({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="pnote pnote--stale" role="status">
      <p className="pnote__text">
        The last refresh failed, so these figures are from the read before it.
        The server said: {error}
      </p>
      <button type="button" className="pnote__retry" onClick={onRetry}>
        Read again
      </button>
    </div>
  );
}

/**
 * Shown wherever ETH or $SWIPE positions are listed.
 *
 * Verified rather than assumed: PredictionMarketV2 on Base has no
 * transferOwnership, and the key that owns it is gone, so no market on it can
 * ever be resolved and no stake on it can be claimed or refunded.
 */
export function ArchivedNote() {
  return (
    <div className="pnote pnote--archived">
      <p className="pnote__text">
        The ETH and $SWIPE positions below sit on the first two contracts. Nobody
        holds the key that resolves those markets, and the contract has no way to
        hand it over, so they cannot settle. No claim, no refund, whichever way
        the question turned out. They are listed because they are yours, not
        because anything is coming back.
      </p>
    </div>
  );
}

/** Row-level marker, so a single archived row is legible on its own. */
export function ArchivedTag() {
  return <span className="ptag ptag--archived">archived, cannot settle</span>;
}
