import type { Metadata } from "next";
import { redis } from "@/lib/redis";
import type { RedisPrediction } from "@/lib/types/redis";

interface Props {
  params: Promise<{ id: string }>;
}

// Generate dynamic metadata for each prediction page
// This allows custom OG images when sharing on Farcaster/social media
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const URL = process.env.NEXT_PUBLIC_URL || 'https://swipe-app.vercel.app';
  
  try {
    // Fetch prediction data from Redis
    const predictionData = await redis.get(`prediction:${id}`);
    
    if (!predictionData) {
      return getDefaultMetadata(URL);
    }
    
    const prediction: RedisPrediction = typeof predictionData === 'string' 
      ? JSON.parse(predictionData) 
      : predictionData as RedisPrediction;
    
    const title = `${prediction.question} | Swipe Predictions`;
    const description = prediction.description || `Join this prediction market and bet on: ${prediction.question}`;
    
    // Calculate stats for image
    const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
    const yesPercentage = totalPool > 0 ? Math.round((prediction.yesTotalAmount / totalPool) * 100) : 50;
    
    // Dynamic OG image URL - can be prediction's image or a generated one
    const ogImageUrl = prediction.imageUrl || `${URL}/api/og/prediction/${id}`;
    
    // Prediction-specific URL
    const predictionUrl = `${URL}/prediction/${id}`;
    
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: predictionUrl,
        siteName: "Swipe Predictions",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
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
              name: "Swipe Predictions",
              url: predictionUrl,
              splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
              splashBackgroundColor: "#d4ff00",
            },
          },
        }),
        // Additional OG tags for better Farcaster compatibility
        "og:image": ogImageUrl,
        "og:image:width": "1200",
        "og:image:height": "630",
      },
    };
  } catch (error) {
    console.error('Error generating metadata for prediction:', error);
    return getDefaultMetadata(URL);
  }
}

function getDefaultMetadata(URL: string): Metadata {
  return {
    title: "Prediction | Swipe",
    description: "Make predictions and win crypto on Swipe!",
    openGraph: {
      title: "Swipe Predictions",
      description: "Make predictions and win crypto on Swipe!",
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
            name: "Swipe Predictions",
            url: URL,
            splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
            splashBackgroundColor: "#d4ff00",
          },
        },
      }),
    },
  };
}

export default function PredictionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

