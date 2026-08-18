import { CHAINS } from './index';
import type { ChainKey } from './types';

/**
 * Where the archived contracts live, in one place.
 *
 * V1, V2 and the SWIPE rewards contracts are all on Base, and their owner key
 * is gone. That stops a market being resolved. It does not stop a market that
 * resolved before the key went from paying out, so claiming against them is
 * legitimate and the app must not refuse it.
 *
 * What it must not do is send the claim somewhere else. wagmi passes
 * `chain: chainId ? { id: chainId } : null`, so a writeContract with no chainId
 * makes viem skip assertCurrentChain and the transaction goes out on whatever
 * chain the connector currently holds. setActiveChain never touches the wallet,
 * and the market page calls it straight off a ?chain= query string, so the
 * app's chain and the wallet's chain diverge as a matter of course.
 *
 * On a chain where the archived address holds no code, a CALL succeeds and
 * returns empty. The transaction mines with status 1, the UI reads that as a
 * win and marks the position claimed, and nothing moved. The money is still on
 * Base and the app now says it was collected. That is why every archived send
 * pins the id and refuses off-chain rather than relying on a revert.
 *
 * These were three module constants inside TinderCard.tsx. EnhancedUserDashboard
 * has the same send and had neither the pin nor the refusal, which is exactly
 * what a copied constant buys you. One definition, both callers.
 */
export const ARCHIVED_CHAIN_KEY: ChainKey = 'base';
export const ARCHIVED_CHAIN_LABEL = CHAINS[ARCHIVED_CHAIN_KEY].label;
export const ARCHIVED_CHAIN_ID = CHAINS[ARCHIVED_CHAIN_KEY].viemChain.id;

/**
 * The sentence shown when someone tries to claim from the wrong network, or
 * null when they are on the right one.
 *
 * Returns the message rather than alerting, so the caller decides how to say
 * it: TinderCard has a toast, the dashboard has a modal, and neither should
 * have to agree with the other about the wording.
 */
export function archivedClaimBlocked(chainKey: ChainKey): string | null {
  if (chainKey === ARCHIVED_CHAIN_KEY) return null;
  return (
    `These rewards sit on ${ARCHIVED_CHAIN_LABEL} contracts. Switch the app to ` +
    `${ARCHIVED_CHAIN_LABEL} to claim them.`
  );
}
