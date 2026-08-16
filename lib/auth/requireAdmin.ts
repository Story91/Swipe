import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import {
  ADMIN_HEADERS,
  buildAdminMessage,
  checkTimestamp,
  parseAdminAllowlist,
} from './adminMessage';

/**
 * Server-side admin check.
 *
 * Until now the only gate was a client-side comparison of the connected wallet
 * against NEXT_PUBLIC_ADMIN_1, which decides what to render and nothing more —
 * every admin route accepted an anonymous curl. This verifies a signature the
 * caller cannot forge without the admin's private key.
 *
 * The allowlist is public information; the proof is the signature, so reading
 * the addresses from NEXT_PUBLIC_* vars is not a weakness. Set ADMIN_ADDRESSES
 * to override.
 */

function allowlist(): string[] {
  return parseAdminAllowlist([
    process.env.ADMIN_ADDRESSES,
    process.env.NEXT_PUBLIC_ADMIN_1,
    process.env.NEXT_PUBLIC_APPROVER_1,
    process.env.NEXT_PUBLIC_APPROVER_2,
    process.env.NEXT_PUBLIC_APPROVER_3,
    process.env.NEXT_PUBLIC_APPROVER_4,
  ]);
}

export type AdminAuthResult =
  | { ok: true; address: string }
  | { ok: false; response: NextResponse };

function deny(reason: string, status = 401): AdminAuthResult {
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: reason }, { status }),
  };
}

/**
 * @param action Short name of the operation, e.g. "resolve". Must match what the
 *               client signed, which is what stops a signature for one action
 *               being replayed against another.
 */
export async function requireAdmin(
  request: NextRequest,
  action: string
): Promise<AdminAuthResult> {
  const admins = allowlist();
  if (admins.length === 0) {
    // Fail closed. An empty allowlist means misconfiguration, and treating that
    // as "allow everyone" is how these checks quietly stop protecting anything.
    console.error('❌ Admin auth is not configured: no valid addresses found');
    return deny('Admin access is not configured', 500);
  }

  const address = request.headers.get(ADMIN_HEADERS.address);
  const signature = request.headers.get(ADMIN_HEADERS.signature);
  const timestamp = request.headers.get(ADMIN_HEADERS.timestamp);

  if (!address || !signature || !timestamp) {
    return deny('Missing admin signature');
  }

  const freshness = checkTimestamp(timestamp);
  if (!freshness.ok) {
    return deny(`Admin signature ${freshness.reason}`);
  }

  if (!admins.includes(address.toLowerCase())) {
    return deny('Not an admin address', 403);
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message: buildAdminMessage(action, Number(timestamp)),
      signature: signature as `0x${string}`,
    });
  } catch (error) {
    console.error('❌ Admin signature verification threw:', error);
    return deny('Invalid admin signature');
  }

  if (!valid) return deny('Invalid admin signature');

  return { ok: true, address: address.toLowerCase() };
}
