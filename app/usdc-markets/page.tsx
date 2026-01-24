'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with framer-motion
const KalshiMarkets = dynamic(
  () => import('../components/Markets/KalshiMarkets'),
  { ssr: false }
);

export default function USDCMarketsPage() {
  return <KalshiMarkets />;
}
