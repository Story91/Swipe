import type { Metadata } from "next";
import { redisHelpers } from "@/lib/redis";
import { DEFAULT_CHAIN_KEY } from "@/lib/chains";
import { resolveChainParam } from "@/lib/chains/requestChain";
import { shareCardUrl } from "@/app/components/Share/shareTargets";

/**
 * Per-market share metadata, restored.
 *
 * This route used to get its generateMetadata from layout.tsx, but a layout is
 * only ever handed `params` - never `?chain=` - so a Robinhood share always read
 * Base's copy of the market id (see the long comment app/prediction/[id]/layout.tsx
 * still carries). The fix is the split Next.js documents for exactly this case: a
 * server page.tsx owns generateMetadata, because a page (unlike a layout) is
 * handed `searchParams` too, and the page's default export stays the client
 * component untouched.
 *
 * The chart-picking logic - cached ImgBB card, else the market's own image, else
 * the drawn /api/og/prediction card - is shareCardUrl/isChartMarket from
 * app/components/Share/shareTargets.ts, the same functions the in-app share
 * preview modal already uses. Two call sites computing the same answer
 * differently is how this drifted last time.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const rawChain = Array.isArray(sp.chain) ? sp.chain[0] : sp.chain;
  const chainResult = resolveChainParam(rawChain ?? null);
  const chain = chainResult.ok ? chainResult.chain : DEFAULT_CHAIN_KEY;

  const URL = process.env.NEXT_PUBLIC_URL || "https://theswipe.app";
  const fallbackImage = process.env.NEXT_PUBLIC_APP_HERO_IMAGE || `${URL}/thumbn.png`;

  const prediction = await redisHelpers.getPrediction(id, chain).catch(() => null);
  if (!prediction) {
    return defaultMetadata(URL, fallbackImage);
  }

  const title = `${prediction.question} | Swipe Predictions`;
  const description =
    prediction.description || `Join this prediction market and bet on: ${prediction.question}`;

  const drawnOrCached = shareCardUrl(
    { id: prediction.id, imageUrl: prediction.imageUrl, includeChart: prediction.includeChart },
    prediction.ogImageUrl ?? null,
    chain
  );
  // shareCardUrl returns the drawn card as a site-relative path; everything
  // else it returns (a cached ImgBB URL, or the market's own imageUrl) is
  // already absolute.
  const ogImageUrl = drawnOrCached.startsWith("/") ? `${URL}${drawnOrCached}` : drawnOrCached;

  const predictionUrl = `${URL}/prediction/${id}?chain=${chain}`;

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
      "og:image": ogImageUrl,
      "og:image:width": "1200",
      "og:image:height": "628",
    },
  };
}

function defaultMetadata(URL: string, fallbackImage: string): Metadata {
  return {
    title: "Prediction | Swipe",
    description: "Make predictions and win crypto on Swipe!",
    openGraph: {
      title: "Swipe Predictions",
      description: "Make predictions and win crypto on Swipe!",
      images: [fallbackImage],
    },
    twitter: {
      card: "summary_large_image",
      title: "Swipe Predictions",
      description: "Make predictions and win crypto on Swipe!",
      images: [fallbackImage],
    },
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: fallbackImage,
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

/**
 * PredictionPageClient is byte-identical to the old page (R100); this default
 * export is unrelated to generateMetadata above and stays exactly as the
 * hotfix left it. See PredictionPageClient.tsx for the actual page.
 */
export { default } from "./PredictionPageClient";
