import type { Metadata } from "next";
import { redis, REDIS_KEYS } from "@/lib/redis";
import { DEFAULT_CHAIN_KEY } from "@/lib/chains";
import { isChainKey } from "@/lib/chains/requestChain";
import type { ChainKey } from "@/lib/chains/types";

interface Props {
  children: React.ReactNode;
  params: Promise<{ address: string }>;
}

/**
 * Generate dynamic metadata for PNL share page
 * This creates fc:miniapp metadata with the user's PNL card image from ImgBB
 * Following Base Mini Apps documentation for dynamic embed images
 */
export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';
  const userAddressLower = address.toLowerCase();
  
  const title = "P&L Overview | Swipe Predictions";
  const description = "Check your trading performance and profit & loss on Swipe Predictions";
  
  /**
   * Which chain's card this page embeds, and why it is not read off the URL.
   *
   * A layout's generateMetadata is handed `params` and nothing else. That is
   * not a guess: Next generates the check itself, and
   * .next/types/app/pnl/[address]/layout.ts declares
   * `LayoutProps { children, params }` beside a `PageProps` that also carries
   * `searchParams`. Adding `?chain=` to the share link would not reach this
   * file however it were written.
   *
   * app/prediction/[id] answered the same problem by splitting into a server
   * page plus a client component, and that is the right answer here too, but it
   * is a change to app/pnl/[address]/page.tsx, which is another agent's file
   * this round. So the chain comes from the pointer that /api/og/upload/pnl and
   * /api/pnl/save-og-url write next to the card: the chain the wallet actually
   * published from. No pointer means Base, which is where every card published
   * before this change already sits, so nothing that exists today moves.
   */
  let chain: ChainKey = DEFAULT_CHAIN_KEY;
  try {
    const lastShared = await redis.get(REDIS_KEYS.USER_PNL_OG_CHAIN(userAddressLower));
    // Validated, never trusted. This value goes on to select a Redis keyspace.
    if (isChainKey(lastShared)) {
      chain = lastShared;
    }
  } catch (error) {
    console.error('Error reading last shared PNL chain from Redis:', error);
  }

  // Get cached OG image URL from Redis (uploaded to ImgBB during share)
  let ogImageUrl = `${URL}/thumbn.png`; // fallback

  try {
    const cachedUrl = await redis.get(REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower, chain));
    if (cachedUrl && typeof cachedUrl === 'string') {
      ogImageUrl = cachedUrl;
      console.log(`📸 Using cached PNL OG image for ${userAddressLower} on ${chain}: ${ogImageUrl}`);
    } else {
      console.log(`⚠️ No cached PNL OG image for ${userAddressLower} on ${chain}, using fallback`);
    }
  } catch (error) {
    console.error('Error fetching PNL OG image from Redis:', error);
  }

  const pnlUrl = `${URL}/pnl/${address}`;
  
  // After clicking the button, user is redirected to dashboard with PNL tab open
  const dashboardPnlUrl = `${URL}/?dashboard=user&pnl=true`;

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
    // fc:miniapp metadata for Farcaster Mini Apps (Base docs compliant)
    other: {
      "fc:miniapp": JSON.stringify({
        version: "next",
        imageUrl: ogImageUrl,
        button: {
          title: "Check your PNL",
          action: {
            type: "launch_frame",
            name: "Swipe Predictions",
            url: dashboardPnlUrl,
            splashImageUrl: process.env.NEXT_PUBLIC_APP_SPLASH_IMAGE,
            splashBackgroundColor: "#d4ff00",
          },
        },
      }),
      // Also add fc:frame for backward compatibility
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: ogImageUrl,
        button: {
          title: "Check your PNL",
          action: {
            type: "launch_frame",
            name: "Swipe Predictions",
            url: dashboardPnlUrl,
            splashImageUrl: process.env.NEXT_PUBLIC_APP_SPLASH_IMAGE,
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

export default function PNLAddressLayout({ children }: Props) {
  return <>{children}</>;
}
