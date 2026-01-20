import { sendFrameNotification } from "@/lib/notification-client";
import { getAllUsersWithNotifications, getAllAppFidsForUser } from "@/lib/notification";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { fid, appFid, title, body, type, broadcast } = await request.json();
    console.log('Notification API called with:', { fid, appFid, title, body, type, broadcast });

    if (!title || !body) {
      console.log('Missing required fields');
      return NextResponse.json(
        { error: "Missing required fields: title, body" },
        { status: 400 }
      );
    }

    let targetFids: number[];

    // If broadcast is true, send to all users with notifications enabled
    if (broadcast === true || broadcast === "true") {
      console.log('Broadcast mode: sending to all users with notifications enabled');
      targetFids = await getAllUsersWithNotifications();
      
      if (targetFids.length === 0) {
        return NextResponse.json(
          { error: "No users with notifications enabled found" },
          { status: 404 }
        );
      }
      
      console.log(`Found ${targetFids.length} users with notifications enabled`);
    } 
    // If fid is provided, use it (single FID or array)
    else if (fid) {
      if (Array.isArray(fid)) {
        targetFids = fid.map((f: string | number) => parseInt(String(f), 10));
      } else {
        targetFids = [parseInt(String(fid), 10)];
      }
    } 
    // If neither broadcast nor fid is provided, return error
    else {
      return NextResponse.json(
        { error: "Either 'fid' or 'broadcast: true' must be provided" },
        { status: 400 }
      );
    }
    
    // Strategy: Send to each user individually through all their clients
    // This ensures notifications reach users on both Base App and Warpcast
    console.log(`Sending notifications to ${targetFids.length} users via their registered clients`);
    
    // For each FID, get all their clients (appFids) and send notifications
    const results = await Promise.allSettled(
      targetFids.map(async (targetFid) => {
        // Get all clients where this user has notifications enabled
        const userClients = await getAllAppFidsForUser(targetFid);
        
        if (userClients.length === 0) {
          console.warn(`No notification clients found for FID ${targetFid}`);
          return { state: "error", error: { message: `No clients found for FID ${targetFid}` } };
        }
        
        // Send notification through each client for this user
        // First try Neynar API (if configured) for all clients at once
        // If that fails, try Base API for each client individually
        const clientResults = await Promise.allSettled(
          userClients.map(({ appFid, notificationDetails }) =>
            sendFrameNotification({
              fid: targetFid,
              appFid,
              title,
              body,
              notificationDetails,
            })
          )
        );
        
        // Return success if at least one client succeeded
        const hasSuccess = clientResults.some(
          (r) => r.status === "fulfilled" && r.value.state === "success"
        );
        
        return hasSuccess 
          ? { state: "success" as const }
          : { state: "error" as const, error: "All clients failed for this FID" };
      })
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.state === "success"
    ).length;
    const failedCount = results.length - successCount;

    // Check if any batch failed
    const errors = results
      .filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.state === "error"))
      .map((r) => {
        if (r.status === "rejected") {
          return r.reason;
        }
        if (r.status === "fulfilled" && r.value.state === "error") {
          return r.value.error;
        }
        return null;
      })
      .filter((e): e is unknown => e !== null);

    if (successCount === 0) {
      return NextResponse.json(
        { 
          error: "Failed to send notifications", 
          details: errors,
          stats: {
            total: targetFids.length,
            success: 0,
            failed: failedCount,
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Notifications sent to ${successCount} out of ${targetFids.length} users`,
      stats: {
        total: targetFids.length,
        success: successCount,
        failed: failedCount,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

