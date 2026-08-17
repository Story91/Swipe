import "./theme.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata, Viewport } from "next";
import { Orbitron, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Orbitron is named in ~40 rules across the app's stylesheets and has never
 * actually been loaded: no @font-face, no link tag, no font files in the repo.
 * Every one of those rules has been falling through to the generic sans-serif
 * fallback in production. Loading it here through next/font self-hosts it at
 * build time, so there is no request to Google at runtime.
 *
 * Exposed as CSS variables and applied by the two stylesheets that ask for it,
 * not on <body>. next/font generates a scoped family name rather than
 * registering the literal "Orbitron", so the rest of the app keeps rendering
 * exactly as it does today. Switching the whole app onto its intended face is a
 * separate decision with a lot of layout riding on it.
 */
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Orbitron is a display face and unreadable at paragraph length. Plex Sans
// carries the prose: humanist enough to contrast the squared display, and it
// holds up at 17px on a dark ground.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Amounts, percentages and addresses. Tabular by construction, so figures in a
// column line up the way a tote board's do.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
  display: "swap",
});

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
    <html lang="en" className={`${orbitron.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-background" style={{ backgroundColor: '#d4ff00' }}>
        <div className="app-container">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
