import type { Metadata } from "next";
import { redis, REDIS_KEYS } from "@/lib/redis";

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
  
  // Get cached OG image URL from Redis (uploaded to ImgBB during share)
  let ogImageUrl = `${URL}/hero.png`; // fallback
  
  try {
    const cachedUrl = await redis.get(REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower));
    if (cachedUrl && typeof cachedUrl === 'string') {
      ogImageUrl = cachedUrl;
      console.log(`📸 Using cached PNL OG image for ${userAddressLower}: ${ogImageUrl}`);
    } else {
      console.log(`⚠️ No cached PNL OG image for ${userAddressLower}, using fallback`);
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
