import { NextResponse } from "next/server";
import { getAllAppFidsForUser } from "@/lib/notification";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fid = url.searchParams.get('fid');
    const appFid = url.searchParams.get('appFid');
    
    if (!fid) {
      return NextResponse.json({
        error: "Please provide fid parameter",
        example: "/api/debug-notifications?fid=12345&appFid=309857"
      });
    }

    const fidNumber = parseInt(fid, 10);
    if (isNaN(fidNumber)) {
      return NextResponse.json({
        error: "Invalid fid parameter. Must be a number."
      });
    }

    // If appFid is provided, get details for that specific client
    if (appFid) {
      const appFidNumber = parseInt(appFid, 10);
      if (isNaN(appFidNumber)) {
        return NextResponse.json({
          error: "Invalid appFid parameter. Must be a number."
        });
      }
      
      const { getUserNotificationDetails } = await import("@/lib/notification");
      const notificationDetails = await getUserNotificationDetails(fidNumber, appFidNumber);
      
      return NextResponse.json({
        fid: fidNumber,
        appFid: appFidNumber,
        hasNotificationDetails: !!notificationDetails,
        notificationDetails,
        timestamp: new Date().toISOString()
      });
    }
    
    // If appFid is not provided, get all clients for this user
    const allClients = await getAllAppFidsForUser(fidNumber);
    
    return NextResponse.json({
      fid: fidNumber,
      totalClients: allClients.length,
      clients: allClients.map(({ appFid, notificationDetails }) => ({
        appFid,
        hasNotificationDetails: !!notificationDetails,
        notificationDetails,
      })),
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
