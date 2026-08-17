import "./theme.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

/**
 * The three type roles, served from this repo rather than fetched from Google.
 *
 * These were on next/font/google, which downloads at BUILD time. That is a
 * silent dependency on the build machine reaching fonts.gstatic.com, and when
 * it does not, the build still succeeds: the <html> element gets the generated
 * class names, the CSS variables are never defined, and every `font-family:
 * var(--font-display), ...` becomes invalid at computed-value time. The whole
 * app then renders in Times New Roman. That is exactly what was observed on one
 * build here - class names present, zero @font-face rules in the document.
 *
 * The files under public/fonts are the latin subsets straight from Google, 112
 * KB for all three. Orbitron and Plex Sans are variable, so one file covers
 * every weight; Plex Mono ships three static instances.
 *
 * Exposed as CSS variables and applied by the stylesheets that ask for them,
 * not on <body>. next/font generates a scoped family name rather than
 * registering the literal "Orbitron", so nothing that names the bare family
 * changes behaviour.
 */
const orbitron = localFont({
  src: [{ path: "../public/fonts/orbitron.woff2", weight: "500 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  // Measured against the fallback so a swap does not shift layout.
  adjustFontFallback: false,
  fallback: ["Orbitron", "sans-serif"],
});

// Orbitron is a display face and unreadable at paragraph length. Plex Sans
// carries the prose: humanist enough to contrast the squared display, and it
// holds up at 17px on a dark ground.
const plexSans = localFont({
  src: [{ path: "../public/fonts/plex-sans.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
});

// Amounts, percentages and addresses. Tabular by construction, so figures in a
// column line up the way a tote board's do.
const plexMono = localFont({
  src: [
    { path: "../public/fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-data",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Monaco", "Menlo", "monospace"],
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
