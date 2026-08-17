import type { Metadata } from 'next';
import { HelpAndFaq } from '../components/Support/HelpAndFaq';

/**
 * Standalone /help route.
 *
 * The same component the app renders as its help-faq dashboard panel, given a
 * real URL because the manifesto's footer links here and there was nothing at
 * this path to link to. A server component wrapper so the page can carry
 * metadata; HelpAndFaq itself is a client component and brings its own state.
 */

export const metadata: Metadata = {
  title: 'Help & FAQ · Swipe',
  description:
    'How a Swipe market pays out: parimutuel settlement, fees off the losing pool, early-entry weighting, and what the contract will not let anyone do.',
};

export default function HelpPage() {
  return <HelpAndFaq />;
}
