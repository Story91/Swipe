'use client';

import React from 'react';
import { getChainConfig, isReadOnlyChain } from '@/lib/chains';
import './ReadOnlyNotice.css';

/**
 * Explains why a chain shows markets that cannot be bet on.
 *
 * The framing is forward-looking on purpose: what a user needs from this notice
 * is what is coming and what happens to what they already have, not a post-mortem
 * of the old contracts. It names no destination chain, because V3 has not picked
 * one yet and a banner that has to be corrected later is worse than a vague one.
 */
export function ReadOnlyNotice() {
  const config = getChainConfig();
  if (!isReadOnlyChain(config.key)) return null;

  return (
    <aside className="readonly-notice" role="status">
      <p className="readonly-notice__title">{config.label} markets are archived</p>
      <p className="readonly-notice__body">
        We are building V3 — audited contracts that are safer and pay out better
        for users. These markets stay here for reference, your past positions and
        results remain visible, and new betting opens with V3.
      </p>
    </aside>
  );
}

export default ReadOnlyNotice;
