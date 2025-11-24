import { NextResponse } from "next/server";
import { getUserNotificationDetails } from "@/lib/notification";

// Known app FIDs
const KNOWN_APP_FIDS = [309857]; // Base app = 309857, add Farcaster FID when known

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fid = url.searchParams.get('fid');
    const appFidParam = url.searchParams.get('appFid');
    
    if (!fid) {
      return NextResponse.json({
        error: "Please provide fid parameter",
        example: "/api/debug-notifications?fid=12345&appFid=309857"
      });
    }

    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber)) {
      return NextResponse.json({
        error: "Invalid fid parameter. Must be a number."
      });
    }

    // If appFid is provided, get details for that specific app
    if (appFidParam) {
      const appFidNumber = parseInt(appFidParam);
      if (isNaN(appFidNumber)) {
        return NextResponse.json({
          error: "Invalid appFid parameter. Must be a number."
        });
      }

      const notificationDetails = await getUserNotificationDetails(fidNumber, appFidNumber);
      
      return NextResponse.json({
        fid: fidNumber,
        appFid: appFidNumber,
        hasNotificationDetails: !!notificationDetails,
        notificationDetails,
        timestamp: new Date().toISOString()
      });
    }

    // Otherwise, check all known app FIDs
    const allDetails = await Promise.all(
      KNOWN_APP_FIDS.map(async (appFid) => {
        const details = await getUserNotificationDetails(fidNumber, appFid);
        return {
          appFid,
          hasNotificationDetails: !!details,
          notificationDetails: details,
        };
      })
    );
    
    return NextResponse.json({
      fid: fidNumber,
      checkedAppFids: KNOWN_APP_FIDS,
      details: allDetails,
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
