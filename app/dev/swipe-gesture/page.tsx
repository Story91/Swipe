import { notFound } from 'next/navigation';
import { SwipeHarness } from './SwipeHarness';

/**
 * Harness for judging the swipe gesture against the approved prototype.
 *
 * Reachable in local development and on Vercel preview deployments, and 404 in
 * production.
 *
 * Gated on VERCEL_ENV rather than NODE_ENV, because a preview build runs with
 * NODE_ENV=production: a NODE_ENV check hides this from the one environment it
 * exists to be tested in. VERCEL_ENV is 'production' only on the production
 * deployment, and is undefined off Vercel entirely, which is why the check is
 * for that exact string rather than for its absence.
 */
export default function SwipeGestureDevPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <SwipeHarness />;
}
