import { notFound } from 'next/navigation';
import { SwipeHarness } from './SwipeHarness';

/**
 * Development-only route for judging the swipe gesture against the approved
 * prototype. Returns 404 in production so it never ships to users.
 */
export default function SwipeGestureDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SwipeHarness />;
}
