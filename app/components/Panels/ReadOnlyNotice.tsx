'use client';

import React from 'react';
import { getChainConfig, isReadOnlyChain } from '@/lib/chains';
import './ReadOnlyNotice.css';

/**
 * Explains why a chain shows markets that cannot be bet on.
 *
 * Base is read-only because every contract there is owned by a key that was
 * compromised and cannot be recovered. PredictionMarketV2 has no
 * transferOwnership at all, so its markets can never be resolved and its stakes
 * can never be claimed. Saying so plainly is better than letting people click
 * a bet button that will fail, or wonder where their balance went.
 */
export function ReadOnlyNotice() {
  const config = getChainConfig();
  if (!isReadOnlyChain(config.key)) return null;

  return (
    <aside className="readonly-notice" role="status">
      <p className="readonly-notice__title">{config.label} markets are archived</p>
      <p className="readonly-notice__body">
        These markets are shown for reference only. New bets, new markets and
        payouts are disabled here after the contract owner key was compromised —
        it cannot be replaced, because the contract has no way to transfer
        ownership. Your past positions and results stay visible.
      </p>
    </aside>
  );
}

export default ReadOnlyNotice;
