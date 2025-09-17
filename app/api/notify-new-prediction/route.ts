import { sendBatchNotifications, notificationTemplates } from "@/lib/notification-helpers";
import { getUserNotificationDetails } from "@/lib/notification";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { predictionTitle, category, targetFids } = await request.json();

    if (!predictionTitle || !category) {
      return NextResponse.json(
        { error: "Missing required fields: predictionTitle, category" },
        { status: 400 }
      );
    }

    // If targetFids is provided, send to specific users
    if (targetFids && Array.isArray(targetFids)) {
      const notifications = targetFids.map(fid => 
        notificationTemplates.newPrediction(fid, predictionTitle, category)
      );
      
      const result = await sendBatchNotifications(notifications);
      
      return NextResponse.json({
        success: true,
        message: `Notifications sent to ${result.success} users`,
        stats: result
      });
    }

    // If no specific FIDs, send to all users who have notifications enabled
    // This would require a database query to get all users with notification tokens
    // For now, return success but no actual notifications sent
    return NextResponse.json({
      success: true,
      message: "No specific users targeted - notifications not sent",
      note: "Provide targetFids array to send notifications to specific users"
    });

  } catch (error) {
    console.error("New prediction notification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
