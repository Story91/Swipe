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
        We are moving to V3: audited contracts with fairer payouts, lower fees
        and protections the old ones could not offer. These markets stay here
        for reference — your past positions and results remain visible — while
        new betting moves to V3 on Robinhood Chain.
      </p>
    </aside>
  );
}

export default ReadOnlyNotice;
