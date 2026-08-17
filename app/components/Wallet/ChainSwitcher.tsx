'use client';

import React, { useMemo, useState } from 'react';
import { CHAINS, isReadOnlyChain } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { chainOptions } from '@/lib/chains/chainSummary';
import { MarketChooserModal } from './MarketChooserModal';
import './ChainSwitcher.css';

/**
 * The nav affordance that opens the market chooser.
 *
 * This was a dropdown listing chain names. A name is not enough to choose
 * between two live deployments of the same contract: they differ in collateral,
 * in what you hold there, in how many markets exist and, because V3's fees are
 * settable after deploy, potentially in what a bet costs. All of that lives in
 * the modal, read from the contracts.
 *
 * What stays here is the trigger and the rule about when it appears. Testnets
 * are only ever offered behind NEXT_PUBLIC_SHOW_TESTNETS, so a testnet is never
 * one stray click away in production.
 */
export function ChainSwitcher() {
  const { chainKey } = useActiveChain();
  const [open, setOpen] = useState(false);

  const showTestnets = process.env.NEXT_PUBLIC_SHOW_TESTNETS === 'true';
  const options = useMemo(() => chainOptions(showTestnets), [showTestnets]);

  // Nothing to switch between: do not take up nav space.
  if (options.length < 2) return null;

  const active = CHAINS[chainKey];

  return (
    <div className="chain-switcher">
      <button
        type="button"
        className="chain-switcher__trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Network: ${active.label}`}
      >
        <span
          className={`chain-switcher__dot${isReadOnlyChain(chainKey) ? ' chain-switcher__dot--archived' : ''}`}
          aria-hidden="true"
        />
        {active.label}
      </button>

      <MarketChooserModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default ChainSwitcher;
