import {
  MiniAppNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";
import { redis } from "@/lib/redis";

const appUrl = process.env.NEXT_PUBLIC_URL || "";
const neynarApiKey = process.env.NEYNAR_API_KEY;
const USE_NEYNAR_API = process.env.USE_NEYNAR_API !== "false"; // Default to true if not set
const neynarWebhookUrl = process.env.NEYNAR_WEBHOOK_URL;
const notificationServiceKey =
  process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "minikit";

// Check if webhook is configured for Neynar
// Neynar API requires webhook to be set to https://api.neynar.com/f/app/<client_id>/event
const isNeynarWebhookConfigured = neynarWebhookUrl?.includes('api.neynar.com/f/app/');

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

      // Check for invalid tokens (expired or revoked)
      if (responseBody.data.result.invalidTokens.length > 0) {
        console.warn(`⚠️ Invalid token detected for FID ${fid}, appFid ${appFid}. Token was expired or revoked.`);
        // Delete invalid token from Redis
        const { deleteUserNotificationDetails } = await import("@/lib/notification");
        await deleteUserNotificationDetails(fid, appFid).catch(() => {});
        
        // If all tokens are invalid, notification was NOT sent
        // Return error state so caller knows notification failed
        return { 
          state: "no_token", 
          error: { message: "Token expired or revoked. User needs to re-enable notifications." }
        };
      }

      if (responseBody.data.result.rateLimitedTokens.length > 0) {
        console.warn(`⚠️ Rate limited token for FID ${fid}, appFid ${appFid}`);
        return { state: "rate_limit" };
      }

      // Only return success if no invalid tokens (notification was actually sent)
      console.log(`✅ Base API notification sent successfully to FID ${fid}, appFid ${appFid}`);
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
 * Neynar API sends to ALL Farcaster clients where user has enabled notifications
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
  
  // Note: Neynar API sends notifications to ALL Farcaster clients where the user
  // has enabled notifications for your mini app. If a user only added the mini app
  // in Base app (appFid: 309857), they will only receive notifications in Base app.
  // To receive notifications in other clients (e.g., Warpcast), users need to add
  // the mini app in those clients as well.

  console.log('Sending notification via Neynar API:', {
    endpoint: 'https://api.neynar.com/v2/farcaster/frame/notifications/',
    targetFids: targetFids.length > 10 ? `${targetFids.length} FIDs` : targetFids,
    title: requestBody.notification.title,
    body: requestBody.notification.body.substring(0, 50) + '...',
    target_url: requestBody.notification.target_url,
  });

  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications/', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": neynarApiKey!,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = await response.json();
    
    console.log('Neynar API response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseJson,
    });

    if (response.status === 200) {
      console.log('✅ Neynar API notification sent successfully');
      return { state: "success" };
    }

    if (response.status === 429) {
      console.warn('⚠️ Neynar API rate limit exceeded');
      return { state: "rate_limit" };
    }

    console.error('❌ Neynar API error:', responseJson);
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

  // Strategy selection: Hybrid approach
  // - If Neynar API is configured: Try Neynar API first (sends to all clients where user has enabled notifications)
  // - If Neynar API fails or is not configured: Fallback to Base API with tokens from Redis
  // - Base API requires tokens from Redis (managed by webhook or manually)
  
  // Try Neynar API if configured (for all clients)
  const shouldUseNeynar = USE_NEYNAR_API && neynarApiKey && isNeynarWebhookConfigured;
  
  if (isNeynarWebhookConfigured && (!neynarApiKey || !USE_NEYNAR_API)) {
    console.warn('⚠️ Webhook is configured for Neynar but Neynar API is not enabled. Set NEYNAR_API_KEY and USE_NEYNAR_API=true to use Neynar API.');
  }
  
  if (USE_NEYNAR_API && neynarApiKey && !isNeynarWebhookConfigured) {
    console.log('ℹ️ Using own webhook - tokens managed in Redis. For broadcast, can use Neynar API if available.');
  }

  if (shouldUseNeynar) {
    console.log('Using Neynar API for notification (sends to all clients where user has enabled notifications)');
    try {
      const result = await sendViaNeynarAPI({ fid, title, body });
      
      // If Neynar API succeeded, return success
      if (result.state === "success") {
        return result;
      }
      
      // If Neynar API failed (e.g., user not found in Neynar, or for Base App), try Base API with Redis tokens as fallback
      console.log('⚠️ Neynar API returned:', result.state, '- trying Base API with Redis tokens as fallback');
      
      // For single FID, try Base API if we have token in Redis
      if (!isMultipleFids && appFid) {
        const tokenData = notificationDetails || await getUserNotificationDetails(targetFids[0], appFid);
        if (tokenData) {
          console.log('✅ Found token in Redis, using Base API as fallback');
          return await sendViaBaseAPI({
            fid: targetFids[0],
            appFid,
            title,
            body,
            notificationDetails: tokenData,
          });
        }
      }
      
      // For multiple FIDs or when appFid not provided, try Base API for each FID individually
      // This handles cases where Neynar API doesn't support certain clients (like Base App)
      if (isMultipleFids || !appFid) {
        console.log('Trying Base API for individual clients as fallback...');
        // Fall through to Base API logic below
      } else {
        // If no token in Redis either, return Neynar error
        return result;
      }
    } catch (error) {
      console.error('❌ Neynar API failed with exception:', error);
      
      // Try Base API as fallback if we have tokens in Redis
      if (!isMultipleFids && appFid) {
        const tokenData = notificationDetails || await getUserNotificationDetails(targetFids[0], appFid);
        if (tokenData) {
          console.log('✅ Found token in Redis, using Base API as fallback after Neynar exception');
          try {
            return await sendViaBaseAPI({
              fid: targetFids[0],
              appFid,
              title,
              body,
              notificationDetails: tokenData,
            });
          } catch (baseError) {
            console.error('❌ Base API fallback also failed:', baseError);
          }
        }
      }
      
      return { 
        state: "error", 
        error: { message: error instanceof Error ? error.message : "Neynar API failed" } 
      };
    }
  }

  // Use Base API (official method from Base docs)
  if (isMultipleFids) {
    // For multiple FIDs with Base API, we need to send individually
    console.log('Sending multiple notifications via Base API (individual requests)');
    const results = await Promise.allSettled(
      targetFids.map(async (singleFid) => {
        // Try to get token (new format or old format)
        let tokenData = notificationDetails;
        let tokenAppFid = appFid || 309857; // Default to Base app FID
        
        if (!tokenData) {
          // Try new format first
          tokenData = await getUserNotificationDetails(singleFid, tokenAppFid);
          
          // If not found, try old format
          if (!tokenData && redis) {
            const oldKey = `${notificationServiceKey}:user:${singleFid}`;
            const oldData = await redis.get<MiniAppNotificationDetails>(oldKey);
            if (oldData && typeof oldData === 'object' && 'url' in oldData && 'token' in oldData) {
              tokenData = oldData;
            }
          }
        }
        
        return sendViaBaseAPI({
          fid: singleFid,
          appFid: tokenAppFid,
          title,
          body,
          notificationDetails: tokenData,
        });
      })
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
  // If appFid not provided, try to get token from old format (backward compatibility)
  if (!appFid) {
    console.warn('appFid not provided, trying to get token from old format...');
    
    // Try to get from old format (without appFid)
    if (redis) {
      const oldKey = `${notificationServiceKey}:user:${targetFids[0]}`;
      const oldData = await redis.get<MiniAppNotificationDetails>(oldKey);
      
      if (oldData && typeof oldData === 'object' && 'url' in oldData && 'token' in oldData) {
        console.log('Found token in old format, using Base API with default appFid');
        // Use Base app FID as default (309857) for old format tokens
        return await sendViaBaseAPI({
          fid: targetFids[0],
          appFid: 309857, // Base app FID
          title,
          body,
          notificationDetails: oldData,
        });
      }
    }
    
    // If no token found, try Neynar API
    if (neynarApiKey) {
      console.log('No token found, trying Neynar API...');
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
