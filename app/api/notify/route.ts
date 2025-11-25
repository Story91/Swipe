import { sendFrameNotification } from "@/lib/notification-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { fid, title, body, type } = await request.json();
    console.log('Notification API called with:', { fid, title, body, type });

    if (!fid || !title || !body) {
      console.log('Missing required fields');
      return NextResponse.json(
        { error: "Missing required fields: fid, title, body" },
        { status: 400 }
      );
    }

    console.log('Sending frame notification to FID:', fid);
    // Send notification to user
    const result = await sendFrameNotification({
      fid: parseInt(fid),
      title,
      body,
    });
    
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

