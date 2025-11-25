import { sendFrameNotification } from "@/lib/notification-client";
import { getAllUsersWithNotifications } from "@/lib/notification";
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
    
    console.log('Sending notification via Neynar API to FIDs:', targetFids);
    
    // Neynar API supports up to 100 FIDs per request
    // If we have more, we need to batch them
    const batchSize = 100;
    const batches: number[][] = [];
    
    for (let i = 0; i < targetFids.length; i += batchSize) {
      batches.push(targetFids.slice(i, i + batchSize));
    }
    
    console.log(`Sending ${targetFids.length} notifications in ${batches.length} batch(es)`);
    
    const results = await Promise.allSettled(
      batches.map((batch) =>
        sendFrameNotification({
          fid: batch, // Array of FIDs
          appFid: 0, // Not used by Neynar API
          title,
          body,
        })
      )
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
            batches: batches.length,
            success: 0,
            failed: failedCount,
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Notifications sent to ${targetFids.length} users via ${batches.length} batch(es)`,
      stats: {
        total: targetFids.length,
        batches: batches.length,
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

