import { sendBatchNotifications, notificationTemplates } from "@/lib/notification-helpers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { 
      predictionTitle, 
      outcome, 
      winners, // Array of FIDs who won
      losers  // Array of FIDs who lost
    } = await request.json();

    if (!predictionTitle || !outcome) {
      return NextResponse.json(
        { error: "Missing required fields: predictionTitle, outcome" },
        { status: 400 }
      );
    }

    const notifications = [];

    // Notify winners
    if (winners && Array.isArray(winners)) {
      const winnerNotifications = winners.map(fid => 
        notificationTemplates.predictionResolved(fid, predictionTitle, outcome, true)
      );
      notifications.push(...winnerNotifications);
    }

    // Notify losers
    if (losers && Array.isArray(losers)) {
      const loserNotifications = losers.map(fid => 
        notificationTemplates.predictionResolved(fid, predictionTitle, outcome, false)
      );
      notifications.push(...loserNotifications);
    }

    if (notifications.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users to notify",
        note: "Provide winners and/or losers arrays to send notifications"
      });
    }

    const result = await sendBatchNotifications(notifications);
    
    return NextResponse.json({
      success: true,
      message: `Prediction resolution notifications sent`,
      stats: {
        total: notifications.length,
        successful: result.success,
        failed: result.failed,
        winners: winners?.length || 0,
        losers: losers?.length || 0
      }
    });

  } catch (error) {
    console.error("Prediction resolution notification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
