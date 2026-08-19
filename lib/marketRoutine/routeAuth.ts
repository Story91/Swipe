/**
 * Vercel Cron authenticates with `Authorization: Bearer CRON_SECRET`. An
 * unset secret means misconfiguration, and treating that as open is how a
 * guard quietly stops guarding, so it fails closed, same policy as
 * requireAdmin's empty allowlist.
 */
export function isCronAuthorized(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  return authorizationHeader === `Bearer ${secret}`;
}
