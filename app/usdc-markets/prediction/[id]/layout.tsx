import type { Metadata } from "next";
import { redis } from "@/lib/redis";
import type { RedisPrediction } from "@/lib/types/redis";

interface Props {
  params: Promise<{ id: string }>;
}

// Generate dynamic metadata for each USDC prediction page
// This allows custom OG images when sharing on Farcaster/social media
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';
  
  try {
    // Fetch prediction data from Redis
    const predictionData = await redis.get(`prediction:${id}`);
    
    if (!predictionData) {
      return getDefaultMetadata(URL);
    }
    
    const prediction: RedisPrediction = typeof predictionData === 'string' 
      ? JSON.parse(predictionData) 
      : predictionData as RedisPrediction;
    
    const title = `${prediction.question} | USDC Markets | Swipe`;
    const description = prediction.description || `Join this USDC prediction market and bet on: ${prediction.question}`;
    
    // Dynamic OG image URL for USDC predictions
    // Priority:
    // 1. Use cached ImgBB URL if exists (from share)
    // 2. Use dynamic USDC generator
    let ogImageUrl: string;
    if (prediction.ogImageUrl) {
      ogImageUrl = prediction.ogImageUrl;
    } else {
      ogImageUrl = `${URL}/api/og/usdc-prediction/${id}`;
    }
    
    // USDC prediction-specific URL
    const predictionUrl = `${URL}/usdc-markets/prediction/${id}`;
    
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: predictionUrl,
        siteName: "Swipe USDC Markets",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 628,
            alt: prediction.question,
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
            title: prediction.resolved ? "View Results" : "Place Your Bet",
            action: {
              type: "launch_frame",
              name: "Swipe USDC Markets",
              url: predictionUrl,
              splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
              splashBackgroundColor: "#d4ff00",
            },
          },
        }),
        // Additional OG tags for better Farcaster compatibility
        "og:image": ogImageUrl,
        "og:image:width": "1200",
        "og:image:height": "628",
      },
    };
  } catch (error) {
    console.error('Error generating metadata for USDC prediction:', error);
    return getDefaultMetadata(URL);
  }
}

function getDefaultMetadata(URL: string): Metadata {
  return {
    title: "USDC Prediction | Swipe",
    description: "Make predictions with USDC and win on Swipe!",
    openGraph: {
      title: "Swipe USDC Markets",
      description: "Make predictions with USDC and win on Swipe!",
      images: [process.env.NEXT_PUBLIC_APP_HERO_IMAGE || `${URL}/hero.png`],
    },
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: process.env.NEXT_PUBLIC_APP_HERO_IMAGE,
        button: {
          title: "Predict, Swipe, Win!",
          action: {
            type: "launch_frame",
            name: "Swipe USDC Markets",
            url: URL,
            splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
            splashBackgroundColor: "#d4ff00",
          },
        },
      }),
    },
  };
}

export default function USDCPredictionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
