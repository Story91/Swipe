import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/miniapp-node";
import {
  setUserNotificationDetails,
  deleteUserNotificationDetails,
} from "@/lib/notification";
import { sendFrameNotification } from "@/lib/notification-client";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const requestJson = await request.json();

  // Parse and verify the webhook event
  let data;
  let verificationFailed = false;
  
  try {
    // Always try to verify with Neynar first (required for Base app)
    if (process.env.NEYNAR_API_KEY) {
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
      console.log("✅ Webhook verified with Neynar");
    } else {
      throw new Error("NEYNAR_API_KEY not set");
    }
  } catch (e: unknown) {
    console.warn("⚠️ Neynar verification failed, using fallback parsing:", e);
    verificationFailed = true;
    
    // Fallback: parse manually without verification (for Farcaster compatibility)
    // This prevents wallet disconnection when verification fails
    try {
      const { header: encodedHeader, payload: encodedPayload } = requestJson;
      if (!encodedHeader || !encodedPayload) {
        throw new Error("Missing header or payload");
      }
      
      function decode(encoded: string) {
        return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
      }
      
      const headerData = decode(encodedHeader);
      const event = decode(encodedPayload);
      
      // Extract appFid - for Farcaster it might not be in header, try to get from event or use 0
      // Base app = 309857, but we'll try to extract it from data
      let appFid = headerData.appFid;
      if (!appFid && event.appFid) {
        appFid = event.appFid;
      }
      // If still no appFid, we'll use 0 and handle it in event processing
      // This is OK for Farcaster which might not send appFid
      
      data = {
        fid: headerData.fid,
        appFid: appFid || 0,
        event: event,
      };
      
      console.log(`⚠️ Using fallback parsing - fid: ${data.fid}, appFid: ${data.appFid}, event: ${event.event}`);
    } catch (fallbackError) {
      console.error("❌ Fallback parsing also failed:", fallbackError);
      // Return 400 only if we can't parse at all
      return Response.json(
        { success: false, error: "Invalid webhook format" },
        { status: 400 },
      );
    }
  }

  // Extract webhook data
  const fid = data.fid;
  const appFid = data.appFid; // The FID of the client app (Base app = 309857, Farcaster = different)
  const event = data.event;

  console.log(`📥 Webhook event: ${event.event} for fid: ${fid}, appFid: ${appFid}${verificationFailed ? ' (fallback parsing)' : ' (verified)'}`);

  // Handle different event types
  // IMPORTANT: Base app waits for webhook response before activating tokens
  // We must return quickly and send notifications asynchronously
  // Note: Base app uses "miniapp_added", Farcaster uses "frame_added" - we support both
  try {
    const eventType = event.event as string;
    
    // Handle miniapp/frame added events (Base app: "miniapp_added", Farcaster: "frame_added")
    if (eventType === "miniapp_added" || eventType === "frame_added") {
      const eventWithDetails = event as { event: string; notificationDetails?: { url: string; token: string } };
      if (eventWithDetails.notificationDetails) {
        await setUserNotificationDetails(fid, appFid, eventWithDetails.notificationDetails);
        // Send notification asynchronously after response (Base app requirement)
        setImmediate(async () => {
          await sendFrameNotification({
            fid,
            appFid,
            title: `👋 Welcome to Swipe!`,
            body: `Thank you for joining our prediction platform! Good luck predicting the future! 🔮`,
          });
        });
      } else {
        await deleteUserNotificationDetails(fid, appFid);
      }
    }
    // Handle miniapp/frame removed events (Base app: "miniapp_removed", Farcaster: "frame_removed")
    else if (eventType === "miniapp_removed" || eventType === "frame_removed") {
      // Delete notification details
      await deleteUserNotificationDetails(fid, appFid);
    }
    // Handle notifications enabled
    else if (eventType === "notifications_enabled") {
      const eventWithDetails = event as { event: string; notificationDetails: { url: string; token: string } };
      // Save new notification details and send confirmation
      await setUserNotificationDetails(fid, appFid, eventWithDetails.notificationDetails);
      // Send notification asynchronously after response (Base app requirement)
      setImmediate(async () => {
        await sendFrameNotification({
          fid,
          appFid,
          title: `🔔 Notifications Enabled!`,
          body: `Thank you for enabling notifications for Swipe. You'll receive updates about your stakes and achievements!`,
        });
      });
    }
    // Handle notifications disabled
    else if (eventType === "notifications_disabled") {
      // Delete notification details
      await deleteUserNotificationDetails(fid, appFid);
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    return Response.json(
      { success: false, error: "Error processing webhook" },
      { status: 500 },
    );
  }

  // Return quickly (Base app requirement: must respond within 10 seconds)
  return Response.json({ success: true });
}
