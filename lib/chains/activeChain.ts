'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { CHAINS, DEFAULT_CHAIN_KEY, isReadOnlyChain, hasArchivedMarkets } from './index';
import type { ChainKey } from './types';

/**
 * The chain the UI is currently pointed at.
 *
 * Kept separate from getChainConfig(), which resolves the build-time default and
 * is what module-scope constants in lib/contract.ts still use. Anything that
 * should follow the switcher must read from this hook rather than those
 * constants.
 *
 * ONE STORE, NOT ONE COPY PER COMPONENT
 *
 * This used to be a plain useState inside the hook. Twenty seven call sites
 * across twenty five files each held their own copy, so pressing the switcher
 * updated the switcher and nothing else: every other component kept the chain
 * it had read from localStorage when it mounted, and only picked up the change
 * if it happened to remount. The visible result was Base's markets rendering
 * under Robinhood's name, with Base's pools, on a network where those markets
 * do not exist.
 *
 * So the value lives in this module and components subscribe to it. The server
 * snapshot is the default, and the stored preference is applied once after
 * mount, which keeps the hydration behaviour the hook already had while making
 * the change reach everybody at once.
 */

export const ACTIVE_CHAIN_KEY = 'swipe:active-chain';

export function parseChainKey(value: string | null | undefined): ChainKey {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so '__proto__'
  // and 'toString' would pass and then resolve to something that is not a
  // chain config at all.
  return value && Object.prototype.hasOwnProperty.call(CHAINS, value)
    ? (value as ChainKey)
    : DEFAULT_CHAIN_KEY;
}

/** Chains a user may pick. Testnets stay hidden unless explicitly enabled. */
export function selectableChains(includeTestnets = false): ChainKey[] {
  return (Object.keys(CHAINS) as ChainKey[]).filter(
    (key) => includeTestnets || !CHAINS[key].viemChain.testnet
  );
}


/**
 * The selected chain, held once for the whole app.
 *
 * useSyncExternalStore rather than a context, because the value is read in
 * twenty five files including several that mount outside any provider this app
 * currently renders, and a missing provider would fail silently by falling back
 * to the default, which is exactly the bug this replaces.
 */
let currentChain: ChainKey = DEFAULT_CHAIN_KEY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Watch the selected chain.
 *
 * Exported so the sharing itself can be tested, and so a non-React consumer can
 * follow the switcher without mounting a component. The hook uses this same
 * function, so a test that subscribes here is watching what the app watches.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ChainKey {
  return currentChain;
}

/**
 * The server has no localStorage, so it always renders the default. Returning
 * anything else here is a hydration mismatch.
 */
function getServerSnapshot(): ChainKey {
  return DEFAULT_CHAIN_KEY;
}

/** Set the chain for every subscriber, and remember it. */
export function setActiveChain(next: ChainKey): void {
  if (next === currentChain) return;
  currentChain = next;
  try {
    window.localStorage.setItem(ACTIVE_CHAIN_KEY, next);
  } catch {
    // Private mode. The session still works, the preference just will not last.
  }
  emit();
}

/** Read the stored preference once, after mount. */
let hydrated = false;
function hydrateOnce(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = parseChainKey(window.localStorage.getItem(ACTIVE_CHAIN_KEY));
    if (stored !== currentChain) {
      currentChain = stored;
      emit();
    }
  } catch {
    // Nothing stored, or storage is unavailable. The default is already set.
  }
}

export function useActiveChain() {
  const chainKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Start from the default so server and first client render agree; the stored
  // preference is applied after mount to avoid a hydration mismatch. Whichever
  // component mounts first does it, and the store tells the rest.
  useEffect(() => {
    hydrateOnce();
  }, []);

  const changeChain = useCallback((next: ChainKey) => {
    setActiveChain(next);
  }, []);

  return {
    chainKey,
    chain: CHAINS[chainKey],
    setChain: changeChain,
    /**
     * No live market on this chain, so nothing can be bet or created. Not a
     * statement about old markets: Base is writable again and still holds
     * archived ones.
     */
    isReadOnly: isReadOnlyChain(chainKey),
    /** This chain holds markets on contracts nobody controls. Copy only. */
    hasArchivedMarkets: hasArchivedMarkets(chainKey),
  };
}
