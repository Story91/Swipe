import type { Metadata } from "next";

interface Props {
  children: React.ReactNode;
}

// Generate dynamic metadata for PNL page
// This allows custom OG images when sharing PNL links on Farcaster/social media
// Note: searchParams not available in layout.tsx in Next.js 15, so we use a generic URL
// The OG image endpoint will extract user param from the referer or use default
export async function generateMetadata(): Promise<Metadata> {
  const URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';
  
  const title = "P&L Overview | Swipe Predictions";
  const description = "Check your trading performance and profit & loss on Swipe Predictions";
  
  // Dynamic OG image URL - will extract user param from referer when page is accessed
  // When Farcaster fetches OG image, it will include the page URL as referer
  const ogImageUrl = `${URL}/api/og/pnl`;
  const pnlUrl = `${URL}/pnl`;
  
  // Note: OG image endpoint will extract user param from referer header
  // when Farcaster crawls the page URL with ?user=0x... query param

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pnlUrl,
      siteName: "Swipe Predictions",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 628,
          alt: "P&L Overview",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    // Farcaster Frame metadata for direct embedding
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: ogImageUrl,
        button: {
          title: "Check your PNL",
          action: {
            type: "launch_frame",
            name: "Swipe Predictions",
            url: pnlUrl,
            splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
            splashBackgroundColor: "#d4ff00",
          },
        },
      }),
      "og:image": ogImageUrl,
      "og:image:width": "1200",
      "og:image:height": "628",
    },
  };
}

export default function PNLLayout({ children }: Props) {
  return <>{children}</>;
}
