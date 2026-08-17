'use client';

import React from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import './ReadOnlyNotice.css';

/**
 * Explains what a user is looking at when a chain shows markets they cannot bet
 * on. Two different situations, and they need two different sentences.
 *
 * Base runs V3 and also carries the old V1, V2 and USDC markets, whose owner key
 * is gone. Saying "Base markets are archived" was true while nothing on Base was
 * live and became a lie the moment V3 deployed there, so the copy now separates
 * the old markets from the chain.
 *
 * A chain with no market contract at all, which is Robinhood today, gets the
 * plainer version: nothing has launched here yet.
 *
 * Reads the switcher rather than the build-time default. A banner about "this
 * network" that always described Base regardless of what the user selected was
 * the same bug the bet guard had.
 */
export function ReadOnlyNotice() {
  const { chain, isReadOnly, hasArchivedMarkets } = useActiveChain();

  if (isReadOnly) {
    return (
      <aside className="readonly-notice" role="status">
        <p className="readonly-notice__title">No markets on {chain.label} yet</p>
        <p className="readonly-notice__body">
          Swipe is coming to {chain.label}. Nothing is live here to bet on right
          now, so switch networks to place a bet.
        </p>
      </aside>
    );
  }

  if (hasArchivedMarkets) {
    return (
      <aside className="readonly-notice" role="status">
        <p className="readonly-notice__title">Older {chain.label} markets are archived</p>
        <p className="readonly-notice__body">
          Betting on {chain.label} runs on V3 now, with audited contracts, fairer
          payouts and fees taken only from the losing side. Markets created before
          V3 stay here for reference and take no new bets. Your past positions and
          results remain visible.
        </p>
      </aside>
    );
  }

  return null;
}

export default ReadOnlyNotice;
