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
  try {
    const requestJson = await request.json();

    // Parse and verify the webhook event
    let data;
    try {
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
      // Events are signed by the app key of a user with a JSON Farcaster Signature.
    } catch (e: unknown) {
      console.error("Webhook verification error:", e);
      // Handle verification errors (invalid data, invalid app key, etc.)
      // Return appropriate error responses with status codes 400, 401, or 500
      if (e instanceof Error) {
        if (e.message.includes("invalid") || e.message.includes("Invalid")) {
          return Response.json(
            { success: false, error: "Invalid webhook data" },
            { status: 400 },
          );
        }
        if (e.message.includes("unauthorized") || e.message.includes("Unauthorized")) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401 },
          );
        }
      }
      return Response.json(
        { success: false, error: "Webhook verification failed" },
        { status: 500 },
      );
    }

    // Extract webhook data
    const fid = data.fid;
    const appFid = data.appFid; // The FID of the client app that the user added the Mini App to
    const event = data.event;

    // Handle different event types
    try {
      switch (event.event) {
        case "miniapp_added":
          console.log(
            "miniapp_added",
            "fid:",
            fid,
            "appFid:",
            appFid,
            "notificationDetails:",
            event.notificationDetails,
          );
          if (event.notificationDetails) {
            await setUserNotificationDetails(fid, appFid, event.notificationDetails);
            await sendFrameNotification({
              fid,
              appFid,
              title: `👋 Welcome to Swipe!`,
              body: `Thank you for joining our prediction platform! Good luck predicting the future! 🔮`,
            });
          } else {
            await deleteUserNotificationDetails(fid, appFid);
          }
          break;

        case "miniapp_removed":
          console.log("miniapp_removed", "fid:", fid, "appFid:", appFid);
          // Delete notification details
          await deleteUserNotificationDetails(fid, appFid);
          break;

        case "notifications_enabled":
          console.log(
            "notifications_enabled",
            "fid:",
            fid,
            "appFid:",
            appFid,
            "notificationDetails:",
            event.notificationDetails,
          );
          // Save new notification details and send confirmation
          await setUserNotificationDetails(fid, appFid, event.notificationDetails);
          await sendFrameNotification({
            fid,
            appFid,
            title: `🔔 Notifications Enabled!`,
            body: `Thank you for enabling notifications for Swipe. You'll receive updates about your stakes and achievements!`,
          });
          break;

        case "notifications_disabled":
          console.log("notifications_disabled", "fid:", fid, "appFid:", appFid);
          // Delete notification details
          await deleteUserNotificationDetails(fid, appFid);
          break;
      }
    } catch (error) {
      console.error("Error processing webhook:", error);
      return Response.json(
        { success: false, error: "Error processing webhook event" },
        { status: 500 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
