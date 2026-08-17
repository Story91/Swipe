'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with framer-motion
const SwipeMarkets = dynamic(
  () => import('../components/Markets/SwipeMarkets'),
  { ssr: false }
);

export default function USDCMarketsPage() {
  return <SwipeMarkets />;
}
