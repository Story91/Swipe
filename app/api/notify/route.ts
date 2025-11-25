import { sendFrameNotification } from "@/lib/notification-client";
import { getAllAppFidsForUser } from "@/lib/notification";
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
    
    // If appFid is provided, send to that specific client
    if (appFid) {
      console.log('Sending frame notification to FID:', fidNumber, 'appFid:', appFid);
      const result = await sendFrameNotification({
        fid: fidNumber,
        appFid: parseInt(appFid, 10),
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
    } else {
      // If appFid is not provided, send to all clients where user has the mini app
      console.log('No appFid provided, sending to all clients for FID:', fidNumber);
      const allClients = await getAllAppFidsForUser(fidNumber);
      
      if (allClients.length === 0) {
        return NextResponse.json(
          { error: "User has not enabled notifications in any client" },
          { status: 403 }
        );
      }

      const results = await Promise.allSettled(
        allClients.map(({ appFid: clientAppFid }) =>
          sendFrameNotification({
            fid: fidNumber,
            appFid: clientAppFid,
            title,
            body,
          })
        )
      );

      const successCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.state === "success"
      ).length;
      const failedCount = results.length - successCount;

      return NextResponse.json({
        success: successCount > 0,
        message: `Notifications sent to ${successCount} out of ${results.length} clients`,
        stats: {
          total: results.length,
          success: successCount,
          failed: failedCount,
        },
      });
    }
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

