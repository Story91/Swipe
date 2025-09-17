import { NextResponse } from "next/server";
import { getUserNotificationDetails } from "@/lib/notification";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fid = url.searchParams.get('fid');
    
    if (!fid) {
      return NextResponse.json({
        error: "Please provide fid parameter",
        example: "/api/debug-notifications?fid=12345"
      });
    }

    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber)) {
      return NextResponse.json({
        error: "Invalid fid parameter. Must be a number."
      });
    }

    // Get notification details
    const notificationDetails = await getUserNotificationDetails(fidNumber);
    
    return NextResponse.json({
      fid: fidNumber,
      hasNotificationDetails: !!notificationDetails,
      notificationDetails,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug notifications error:', error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
