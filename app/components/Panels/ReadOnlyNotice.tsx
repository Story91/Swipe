'use client';

import React from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import './ReadOnlyNotice.css';

/**
 * Explains what a user is looking at when a chain shows markets they cannot bet
 * on. Two different situations, and they need two different sentences.
 *
 * Base runs the live contract and also carries the old V1, V2 and USDC markets,
 * whose owner key is gone. Saying "Base markets are archived" was true while
 * nothing on Base was live and became a lie the moment a live contract deployed
 * there, so the copy separates the old markets from the chain.
 *
 * Neither branch names a contract generation any more. The archived text said
 * "runs on V3 now" and went stale the day V4 replaced it, which is the same
 * failure the routing gates had: a version number written into a sentence is a
 * fact with an expiry date on it. It also promised audited contracts, and no
 * audit covers what is deployed.
 *
 * The read-only branch is for a chain with no market contract at all. Both live
 * chains have one today, so it does not currently fire, and it stays because a
 * third chain starts out exactly there.
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
          New markets on {chain.label} run on a new contract, where fees come out
          of the losing side only and betting early counts for more. The older
          ones stay here for reference and take no new bets. Nobody holds the key
          that settles them, so a market still open on one of those can never be
          decided. If it settled before the key was lost, the payout is still
          there to collect.
        </p>
      </aside>
    );
  }

  return null;
}

export default ReadOnlyNotice;
