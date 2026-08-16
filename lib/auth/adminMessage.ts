/**
 * Canonical message an admin signs to prove a request is theirs.
 *
 * Pure string/'time handling only — no React, no viem, no network — so the
 * format and the replay window can be unit tested directly, and the client and
 * server are guaranteed to build the identical string.
 */

/** How long a signature stays usable. Long enough for a slow wallet prompt,
 *  short enough that a captured header is worthless soon after. */
export const ADMIN_SIGNATURE_TTL_MS = 5 * 60 * 1000;

export const ADMIN_HEADERS = {
  address: 'x-admin-address',
  signature: 'x-admin-signature',
  timestamp: 'x-admin-timestamp',
} as const;

/**
 * The action name binds a signature to one operation, so a signature captured
 * from a harmless call cannot be replayed against a destructive one.
 */
export function buildAdminMessage(action: string, timestamp: number): string {
  return [
    'Swipe admin action',
    `action: ${action}`,
    `timestamp: ${timestamp}`,
  ].join('\n');
}

export type TimestampCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'future' };

/** Rejects stale signatures, and clock-skewed ones from the future. */
export function checkTimestamp(
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

  // A small allowance for clock skew between the signer and the server.
  const SKEW_MS = 30_000;
  if (timestamp > now + SKEW_MS) return { ok: false, reason: 'future' };
  if (now - timestamp > ADMIN_SIGNATURE_TTL_MS) return { ok: false, reason: 'expired' };

  return { ok: true };
}

/** Parses the server-side allowlist. Addresses are not secrets; the proof is
 *  the signature, so falling back to the public admin vars is safe. */
export function parseAdminAllowlist(
  values: (string | undefined)[]
): string[] {
  return values
    .filter((v): v is string => Boolean(v))
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().toLowerCase())
    .filter((v) => /^0x[0-9a-f]{40}$/.test(v));
}
