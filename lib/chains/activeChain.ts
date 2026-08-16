'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAINS, DEFAULT_CHAIN_KEY } from './index';
import type { ChainKey } from './types';

/**
 * The chain the UI is currently pointed at.
 *
 * Kept separate from getChainConfig(), which resolves the build-time default and
 * is what module-scope constants in lib/contract.ts still use. Anything that
 * should follow the switcher must read from this hook rather than those
 * constants.
 *
 * Known limitation: Redis keys are not yet namespaced per chain
 * (prediction:pred_v2_1, not prediction:base:pred_v2_1), so switching changes
 * which contracts the UI talks to but both chains still read the same market
 * records. Namespacing is phase 5 of the rebuild plan and has to land before
 * this is safe for writing markets on two chains at once.
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

export function useActiveChain() {
  // Start from the default so server and first client render agree; the stored
  // preference is applied after mount to avoid a hydration mismatch.
  const [chainKey, setChainKey] = useState<ChainKey>(DEFAULT_CHAIN_KEY);

  useEffect(() => {
    try {
      setChainKey(parseChainKey(window.localStorage.getItem(ACTIVE_CHAIN_KEY)));
    } catch {
      // Storage can throw in private mode; the default is already in state.
    }
  }, []);

  const changeChain = useCallback((next: ChainKey) => {
    setChainKey(next);
    try {
      window.localStorage.setItem(ACTIVE_CHAIN_KEY, next);
    } catch {
      // Preference will not persist; the session still works.
    }
  }, []);

  return {
    chainKey,
    chain: CHAINS[chainKey],
    setChain: changeChain,
    isReadOnly: CHAINS[chainKey].readOnly === true,
  };
}
