import {
  MiniAppNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";

const appUrl = process.env.NEXT_PUBLIC_URL || "";

// Known app FIDs
// Base app FID = 309857 (from Base docs)
// Farcaster app FID - we'll try to find it or use a fallback
const KNOWN_APP_FIDS = [309857]; // Base app, add Farcaster FID when known

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

// Helper to send notification to all known appFids for a user
export async function sendFrameNotificationToAllApps({
  fid,
  title,
  body,
}: {
  fid: number;
  title: string;
  body: string;
}): Promise<{ success: boolean; results: Array<{ appFid: number; result: SendFrameNotificationResult }> }> {
  const results = await Promise.allSettled(
    KNOWN_APP_FIDS.map(async (appFid) => {
      const result = await sendFrameNotification({
        fid,
        appFid,
        title,
        body,
      });
      return { appFid, result };
    })
  );

  const successful = results.filter(
    (r) => r.status === "fulfilled" && r.value.result.state === "success"
  ).length > 0;

  return {
    success: successful,
    results: results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r.status === "fulfilled" ? r.value : { appFid: 0, result: { state: "error" as const, error: "Unknown error" } })),
  };
}

export async function sendFrameNotification({
  fid,
  appFid,
  title,
  body,
  notificationDetails,
}: {
  fid: number;
  appFid: number;
  title: string;
  body: string;
  notificationDetails?: MiniAppNotificationDetails | null;
}): Promise<SendFrameNotificationResult> {
  console.log('sendFrameNotification called for FID:', fid, 'appFid:', appFid, 'title:', title);
  
  if (!notificationDetails) {
    console.log('Fetching notification details for FID:', fid, 'appFid:', appFid);
    notificationDetails = await getUserNotificationDetails(fid, appFid);
  }
  
  console.log('Notification details:', notificationDetails);
  
  if (!notificationDetails) {
    console.log('No notification details found for FID:', fid);
    return { state: "no_token" };
  }

  const response = await fetch(notificationDetails.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  const responseJson = await response.json();

  if (response.status === 200) {
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      return { state: "rate_limit" };
    }

    return { state: "success" };
  }

  return { state: "error", error: responseJson };
}
