'use client';

import React, { useMemo, useState } from 'react';
import { CHAINS, isReadOnlyChain } from '@/lib/chains';
import type { ChainKey } from '@/lib/chains/types';
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
/**
 * The mark shown beside a network's name.
 *
 * Both are the networks' own artwork rather than anything drawn here, because a
 * wrong mark on a network selector reads as official and is worse than no mark
 * at all. Base's square is already in public/. Robinhood's is the icon its own
 * Blockscout instance serves at /assets/configs/network_icon_dark.svg, saved to
 * public/robinhood-chain.svg; the dark variant, because it is white artwork and
 * this nav is dark, while the light one is near black and would disappear.
 *
 * A chain with no artwork falls back to a lettered tile in the same box, so a
 * third network does not shift the nav while someone finds its logo.
 */
export function chainMark(key: ChainKey): { src?: string; letter: string } {
  if (key === 'base') return { src: '/Base_square_blue.png', letter: 'B' };
  if (key === 'robinhood') return { src: '/robinhood-chain.svg', letter: 'R' };
  return { letter: key.slice(0, 1).toUpperCase() };
}

export function ChainSwitcher() {
  const { chainKey } = useActiveChain();
  const [open, setOpen] = useState(false);

  const showTestnets = process.env.NEXT_PUBLIC_SHOW_TESTNETS === 'true';
  const options = useMemo(() => chainOptions(showTestnets), [showTestnets]);

  // Nothing to switch between: do not take up nav space.
  if (options.length < 2) return null;

  const active = CHAINS[chainKey];
  const mark = chainMark(chainKey);

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
        {mark.src ? (
          <img src={mark.src} alt="" className="chain-switcher__mark" />
        ) : (
          <span className="chain-switcher__mark chain-switcher__mark--letter" aria-hidden="true">
            {mark.letter}
          </span>
        )}
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
