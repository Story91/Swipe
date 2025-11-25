import { sendFrameNotification } from "@/lib/notification-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { fid, appFid, title, body, type } = await request.json();
    console.log('Notification API called with:', { fid, appFid, title, body, type });

    if (!fid || !title || !body) {
      console.log('Missing required fields');
      return NextResponse.json(
        { error: "Missing required fields: fid, title, body" },
        { status: 400 }
      );
    }

    const fidNumber = parseInt(fid, 10);
    
    // Neynar API automatically filters users who haven't enabled notifications
    // We can send to single FID or array of FIDs
    const targetFids = Array.isArray(fid) ? fid.map((f: string | number) => parseInt(String(f), 10)) : [fidNumber];
    
    console.log('Sending notification via Neynar API to FIDs:', targetFids);
    
    // Send notification via Neynar API
    // Note: appFid is not needed when using Neynar API - they manage tokens automatically
    const result = await sendFrameNotification({
      fid: fidNumber, // Primary FID for logging
      appFid: appFid ? parseInt(appFid, 10) : 0, // Not used by Neynar API but kept for compatibility
      title,
      body,
    });
    
    console.log('Neynar notification result:', result);

    switch (result.state) {
      case "success":
        return NextResponse.json({ 
          success: true, 
          message: "Notification sent successfully via Neynar API" 
        });
      
      case "rate_limit":
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429 }
        );
      
      case "error":
        return NextResponse.json(
          { error: "Failed to send notification", details: result.error },
          { status: 500 }
        );
      
      default:
        return NextResponse.json(
          { error: "Unknown error" },
          { status: 500 }
        );
    }
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

