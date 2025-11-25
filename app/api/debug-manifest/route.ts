import { NextResponse } from "next/server";

export async function GET() {
  const URL = process.env.NEXT_PUBLIC_URL;
  const NEYNAR_WEBHOOK_URL = process.env.NEYNAR_WEBHOOK_URL;

  return NextResponse.json({
    environment: {
      NEXT_PUBLIC_URL: URL,
      NEYNAR_WEBHOOK_URL: NEYNAR_WEBHOOK_URL,
      NEYNAR_API_KEY: process.env.NEYNAR_API_KEY ? "✅ SET" : "❌ NOT SET",
      USE_NEYNAR_API: process.env.USE_NEYNAR_API,
    },
    manifest: {
      webhookUrl: NEYNAR_WEBHOOK_URL || `${URL}/api/webhook`,
      isNeynarWebhook: NEYNAR_WEBHOOK_URL?.includes('api.neynar.com/f/app/'),
      note: NEYNAR_WEBHOOK_URL 
        ? "✅ Using Neynar webhook - Neynar manages tokens automatically, use Neynar API for notifications"
        : "⚠️ Using own webhook - you manage tokens in Redis, use Base API for notifications",
    },
    important: {
      ifNeynarWebhook: [
        "Neynar receives webhooks from Farcaster clients",
        "Neynar manages notification tokens automatically",
        "You DON'T need your own /api/webhook handler",
        "Use Neynar API to send notifications (already configured)",
        "Manifest may be cached - refresh in Warpcast: Settings > Developer Tools > Domains"
      ],
      ifOwnWebhook: [
        "Your /api/webhook receives events from Farcaster",
        "You manage tokens in Redis",
        "Use Base API to send notifications with tokens"
      ]
    },
    timestamp: new Date().toISOString(),
  });
}

