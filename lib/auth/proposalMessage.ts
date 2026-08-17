/**
 * Canonical message a creator signs to propose a market.
 *
 * This is not an admin check and must not become one. Anyone with a wallet may
 * propose; the signature only proves the address in the proposal belongs to the
 * person sending it. That matters because the creator earns 0.5% of every
 * losing pool in their market, so without it anyone could mint proposals
 * crediting someone else, or squat an address's reputation.
 *
 * What replaced the old creation fee is not this signature, it is the rate
 * limit in the route. V2 charged for creation and that was its only spam
 * control; V3 charges nothing, and the answer to "what stops a flood" is a cap
 * per address and a cap on the pending queue, not a toll on ordinary users.
 * A proposal is inert until a resolver registers it on chain, so the exposure
 * is Redis writes, not money.
 *
 * Pure string handling, no React, no viem, no network, so the client and server
 * are guaranteed to build the identical string and the format is unit testable.
 */

/** Long enough for a slow wallet prompt, short enough that a captured header
 *  is worthless soon after. */
export const PROPOSAL_SIGNATURE_TTL_MS = 5 * 60 * 1000;

export const PROPOSAL_HEADERS = {
  address: 'x-proposal-address',
  signature: 'x-proposal-signature',
  timestamp: 'x-proposal-timestamp',
} as const;

/**
 * The question and deadline are inside the signed string on purpose.
 *
 * A signature bound only to a timestamp would let a captured header be replayed
 * with a different question against the same address, which is how a creator
 * ends up credited for a market they never wrote.
 */
export function buildProposalMessage(params: {
  question: string;
  deadline: number;
  timestamp: number;
}): string {
  return [
    'Swipe market proposal',
    `question: ${params.question.trim()}`,
    `deadline: ${params.deadline}`,
    `timestamp: ${params.timestamp}`,
  ].join('\n');
}

export type TimestampCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'future' };

/** Rejects stale signatures, and clock-skewed ones from the future. */
export function checkProposalTimestamp(
  raw: string | null | undefined,
  now: number = Date.now()
): TimestampCheck {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, reason: 'missing' };
  }

  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, reason: 'malformed' };
  }

  const SKEW_MS = 30_000;
  if (timestamp > now + SKEW_MS) return { ok: false, reason: 'future' };
  if (now - timestamp > PROPOSAL_SIGNATURE_TTL_MS) return { ok: false, reason: 'expired' };

  return { ok: true };
}

/**
 * How many proposals one address may make in a rolling window, and how many may
 * sit unregistered in total.
 *
 * The per-address cap stops one wallet flooding. The global cap stops a swarm
 * of fresh wallets doing the same, since a new address costs nothing. Both are
 * deliberately generous for a real person and useless for a script.
 */
export const PROPOSAL_LIMITS = {
  perAddressPerWindow: 5,
  windowSeconds: 24 * 60 * 60,
  maxPending: 60,
} as const;
