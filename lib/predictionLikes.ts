import { chainNamespace } from './redis';
import type { ChainKey } from './chains';

/**
 * Likes on a market that has been proposed and is waiting to be registered.
 *
 * What this is for: an admin reviewing the queue has no signal about which
 * proposals anyone actually wants. Five a day per address can arrive, and the
 * only ordering today is whatever came in first. A like is the cheapest signal
 * that costs a person nothing and tells the reviewer something real.
 *
 * What it is not: it is not a bet, it does not move money, and it is not proof
 * of anything on chain. So it is deliberately not signed. Requiring a wallet
 * signature to tap a heart would kill the signal it exists to collect, and the
 * worst an unsigned like can do is misrank a review queue. Anything that
 * touches money is signed; this is not that.
 *
 * The store is a Set of addresses rather than a counter. Three reasons, and the
 * counter fails all of them: a Set makes a like idempotent, so a double tap or
 * a retried request cannot inflate it. It makes the like revocable, which a
 * counter can only do by trusting the client to send -1. And it lets the UI
 * answer "have I already liked this", which a counter cannot.
 *
 * Chain namespaced like everything else about a market, because market 5 on
 * Base and market 5 on Robinhood are two different questions.
 */
export function predictionLikesKey(predictionId: string, chain?: ChainKey): string {
  return `${chainNamespace(chain)}prediction:likes:${predictionId}`;
}

/** The one shape the API answers with, so the client has nothing to derive. */
export interface LikeState {
  /** How many distinct addresses have liked it. */
  count: number;
  /** Whether the address that asked is one of them. False when none was given. */
  liked: boolean;
}

/**
 * Addresses are stored lowercased.
 *
 * A wallet hands over a checksummed address and a Redis set is bytes, so
 * without this one person could like the same proposal twice by arriving
 * through two code paths that case it differently. The stake keys had exactly
 * that bug and it emptied portfolios.
 */
export function normaliseLiker(address: string): string {
  return address.trim().toLowerCase();
}

/** Only an address that looks like one gets to vote. */
export function isAddressLike(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
