import "./theme.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';
  const title = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Swipe";
  const description = "Swipe - Betting on the Future. Predict, Swipe, Win!";
  const ogImage = process.env.NEXT_PUBLIC_APP_HERO_IMAGE || `${URL}/hero.png`;
  
  return {
    title,
    description,
    icons: {
      icon: "/micro.png",
      shortcut: "/micro.png",
      apple: "/micro.png",
    },
    openGraph: {
      title,
      description,
      url: URL,
      siteName: "Swipe Predictions",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 628,
          alt: "Swipe - Predict, Swipe, Win!",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: process.env.NEXT_PUBLIC_APP_HERO_IMAGE,
        button: {
          title: "Predict, Swipe, Win!",
          action: {
            type: "launch_frame",
            name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME,
            url: URL,
            splashImageUrl: process.env.NEXT_PUBLIC_SPLASH_IMAGE,
            splashBackgroundColor: "#d4ff00",
          },
        },
      }),
      // Additional OG tags for better Farcaster compatibility
      "og:image": ogImage,
      "og:image:width": "1200",
      "og:image:height": "628",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background" style={{ backgroundColor: '#d4ff00' }}>
        <div className="app-container">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
