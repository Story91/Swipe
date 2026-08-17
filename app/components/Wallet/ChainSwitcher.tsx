'use client';

import React, { useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAINS, isReadOnlyChain } from '@/lib/chains';
import { useActiveChain, selectableChains } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains/types';
import './ChainSwitcher.css';

/**
 * Network switcher for the main nav.
 *
 * A chain with no live market is shown but labelled, rather than hidden: people
 * still need to reach their old positions, and silently dropping a network they
 * had funds on is worse than saying it takes no new bets.
 *
 * The label follows the market, not the chain's past. Base carries archived
 * markets and a live V3 contract, so it is not labelled; Robinhood has no
 * market deployed yet, so it is.
 *
 * Testnets appear only when NEXT_PUBLIC_SHOW_TESTNETS is set, so a testnet is
 * never one stray click away in production.
 */
export function ChainSwitcher() {
  const { chainKey, setChain } = useActiveChain();
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<ChainKey | null>(null);

  const showTestnets = process.env.NEXT_PUBLIC_SHOW_TESTNETS === 'true';
  const options = selectableChains(showTestnets);

  // Nothing to switch between: do not take up nav space.
  if (options.length < 2) return null;

  const active = CHAINS[chainKey];

  /**
   * Move the wallet, then record the choice. Not the other way round.
   *
   * This used to write localStorage and nothing else, so the app's idea of the
   * current chain and the wallet's could disagree indefinitely. Reads without an
   * explicit chainId run on the wallet's chain, so picking a network changed the
   * labels and the addresses the app resolved while the reads still executed
   * somewhere else.
   *
   * A declined switch leaves the UI where it was, which is the honest outcome:
   * the selection did not happen. `useMarketWrite` still re-checks and switches
   * at send time regardless; that is what protects the money, and this is the
   * convenience layer above it.
   */
  const pick = async (key: ChainKey) => {
    if (key === chainKey) {
      setOpen(false);
      return;
    }
    setSwitching(key);
    try {
      if (isConnected) {
        await switchChainAsync({ chainId: CHAINS[key].viemChain.id });
      }
      setChain(key);
      setOpen(false);
    } catch {
      // Declined or unsupported. Leave the selection alone.
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="chain-switcher">
      <button
        type="button"
        className="chain-switcher__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Network: ${active.label}`}
      >
        <span className={`chain-switcher__dot${isReadOnlyChain(chainKey) ? ' chain-switcher__dot--archived' : ''}`} aria-hidden="true" />
        {active.label}
      </button>

      {open && (
        <div className="chain-switcher__menu" role="menu">
          {options.map((key) => {
            const config = CHAINS[key];
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`chain-switcher__option${key === chainKey ? ' chain-switcher__option--active' : ''}`}
                onClick={() => pick(key)}
                // The wallet has to agree before the choice is recorded, and
                // that takes a prompt. Disabling avoids queueing a second one.
                disabled={switching !== null}
                aria-busy={switching === key}
              >
                <span className={`chain-switcher__dot${isReadOnlyChain(key) ? ' chain-switcher__dot--archived' : ''}`} aria-hidden="true" />
                <span className="chain-switcher__name">{config.label}</span>
                {isReadOnlyChain(key) && (
                  <span className="chain-switcher__tag">no market yet</span>
                )}
                {config.viemChain.testnet && (
                  <span className="chain-switcher__tag">testnet</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ChainSwitcher;
