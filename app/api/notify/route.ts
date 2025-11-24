import { sendFrameNotification, sendFrameNotificationToAllApps } from "@/lib/notification-client";
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

    console.log('Sending frame notification to FID:', fid, 'appFid:', appFid);
    
    // If appFid is provided, send to specific app
    // Otherwise, try all known apps (Base, Farcaster, etc.)
    const result = appFid
      ? await sendFrameNotification({
          fid: parseInt(fid),
          appFid: parseInt(appFid),
          title,
          body,
        })
      : (await sendFrameNotificationToAllApps({
          fid: parseInt(fid),
          title,
          body,
        })).results[0]?.result || { state: "no_token" as const };
    
    console.log('Frame notification result:', result);

    switch (result.state) {
      case "success":
        return NextResponse.json({ 
          success: true, 
          message: "Notification sent successfully" 
        });
      
      case "no_token":
        return NextResponse.json(
          { error: "User has not enabled notifications" },
          { status: 403 }
        );
      
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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

