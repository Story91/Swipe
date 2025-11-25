import {
  MiniAppNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";

const appUrl = process.env.NEXT_PUBLIC_URL || "";
const neynarApiKey = process.env.NEYNAR_API_KEY;
const USE_NEYNAR_API = process.env.USE_NEYNAR_API !== "false"; // Default to true if not set

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

/**
 * Send notification using Base Mini Apps API (direct with tokens)
 * This is the official Base/Farcaster method from documentation
 */
async function sendViaBaseAPI({
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
  if (!notificationDetails) {
    notificationDetails = await getUserNotificationDetails(fid, appFid);
  }

  if (!notificationDetails) {
    return { state: "no_token" };
  }

  const requestBody = {
    notificationId: crypto.randomUUID(),
    title: title.substring(0, 32),
    body: body.substring(0, 128),
    targetUrl: appUrl,
    tokens: [notificationDetails.token],
  } satisfies SendNotificationRequest;

  try {
    const response = await fetch(notificationDetails.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = await response.json();

    if (response.status === 200) {
      const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
      if (responseBody.success === false) {
        return { state: "error", error: responseBody.error.errors };
      }

      if (responseBody.data.result.invalidTokens.length > 0) {
        // Delete invalid token
        const { deleteUserNotificationDetails } = await import("@/lib/notification");
        await deleteUserNotificationDetails(fid, appFid).catch(() => {});
      }

      if (responseBody.data.result.rateLimitedTokens.length > 0) {
        return { state: "rate_limit" };
      }

      return { state: "success" };
    }

    return { state: "error", error: responseJson };
  } catch (error) {
    return { 
      state: "error", 
      error: { message: error instanceof Error ? error.message : "Network error" } 
    };
  }
}

/**
 * Send notification using Neynar API
 * Neynar manages tokens automatically, we just need to send FIDs
 */
async function sendViaNeynarAPI({
  fid,
  title,
  body,
}: {
  fid: number | number[];
  title: string;
  body: string;
}): Promise<SendFrameNotificationResult> {
  const targetFids = Array.isArray(fid) ? fid : [fid];

  const requestBody = {
    target_fids: targetFids,
    notification: {
      title: title.substring(0, 32),
      body: body.substring(0, 128),
      target_url: appUrl,
    },
  };

  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": neynarApiKey!,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = await response.json();

    if (response.status === 200) {
      return { state: "success" };
    }

    if (response.status === 429) {
      return { state: "rate_limit" };
    }

    return { state: "error", error: responseJson };
  } catch (error) {
    return { 
      state: "error", 
      error: { message: error instanceof Error ? error.message : "Network error" } 
    };
  }
}

/**
 * Send notification - hybrid approach
 * Uses Neynar API if available (for broadcast/multiple FIDs), otherwise falls back to Base API
 * 
 * @param fid - Single FID or array of FIDs to send notification to
 * @param appFid - Required for Base API, optional for Neynar API
 * @param title - Notification title (max 32 chars)
 * @param body - Notification body (max 128 chars)
 * @param notificationDetails - Optional, will be fetched if not provided
 */
export async function sendFrameNotification({
  fid,
  appFid,
  title,
  body,
  notificationDetails,
}: {
  fid: number | number[];
  appFid?: number;
  title: string;
  body: string;
  notificationDetails?: MiniAppNotificationDetails | null;
}): Promise<SendFrameNotificationResult> {
  const targetFids = Array.isArray(fid) ? fid : [fid];
  const isMultipleFids = Array.isArray(fid) && fid.length > 1;
  
  console.log('sendFrameNotification called for FIDs:', targetFids, 'title:', title);

  if (!appUrl) {
    console.error('NEXT_PUBLIC_URL is not set! Cannot send notification.');
    return { 
      state: "error", 
      error: { message: "NEXT_PUBLIC_URL environment variable is not configured" } 
    };
  }

  // Strategy selection:
  // 1. If multiple FIDs or broadcast -> use Neynar API (easier, no token management)
  // 2. If single FID and Neynar available -> prefer Neynar API
  // 3. If single FID and no Neynar or USE_NEYNAR_API=false -> use Base API with tokens
  // 4. Fallback to Base API if Neynar fails

  const shouldUseNeynar = USE_NEYNAR_API && neynarApiKey && (isMultipleFids || !appFid);

  if (shouldUseNeynar) {
    console.log('Using Neynar API for notification');
    try {
      return await sendViaNeynarAPI({ fid, title, body });
    } catch (error) {
      console.warn('Neynar API failed, falling back to Base API:', error);
      // Fall through to Base API
    }
  }

  // Use Base API (official method from Base docs)
  if (isMultipleFids) {
    // For multiple FIDs with Base API, we need to send individually
    console.log('Sending multiple notifications via Base API (individual requests)');
    const results = await Promise.allSettled(
      targetFids.map((singleFid) => 
        sendViaBaseAPI({
          fid: singleFid,
          appFid: appFid || 0, // Default appFid if not provided
          title,
          body,
          notificationDetails,
        })
      )
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.state === "success"
    ).length;

    if (successCount === 0) {
      const firstError = results.find(r => r.status === "fulfilled" && r.value.state === "error");
      return firstError && firstError.status === "fulfilled" 
        ? firstError.value 
        : { state: "error", error: "All notifications failed" };
    }

    return { state: "success" };
  }

  // Single FID with Base API
  if (!appFid) {
    console.warn('appFid not provided, cannot use Base API. Trying Neynar...');
    if (neynarApiKey) {
      return await sendViaNeynarAPI({ fid: targetFids[0], title, body });
    }
    return { 
      state: "error", 
      error: { message: "Either appFid (for Base API) or NEYNAR_API_KEY (for Neynar API) is required" } 
    };
  }

  console.log('Using Base API (official method) for notification');
  return await sendViaBaseAPI({
    fid: targetFids[0],
    appFid,
    title,
    body,
    notificationDetails,
  });
}
