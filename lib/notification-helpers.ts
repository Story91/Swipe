import { sendFrameNotification } from "./notification-client";

export interface NotificationData {
  fid: number;
  title: string;
  body: string;
  type?: 'stake_success' | 'stake_failed' | 'prediction_shared' | 'prediction_resolved' | 'new_prediction' | 'achievement';
}

// Helper function to send notification via API
export async function sendNotificationToUser(data: NotificationData): Promise<boolean> {
  try {
    console.log('Sending notification to user:', data);
    
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();
    console.log('Notification API response:', response.status, responseData);

    return response.ok;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

// Predefined notification templates
export const notificationTemplates = {
  stakeSuccess: (fid: number, predictionTitle: string, stakeAmount: string, outcome: string) => ({
    fid,
    title: "🎉 Stake Accepted!",
    body: `Your ${stakeAmount} ETH stake on "${predictionTitle}" has been accepted! Prediction: ${outcome}`,
    type: 'stake_success' as const
  }),

  stakeFailed: (fid: number, predictionTitle: string, reason: string) => ({
    fid,
    title: "❌ Stake Rejected",
    body: `Failed to place stake on "${predictionTitle}". Reason: ${reason}`,
    type: 'stake_failed' as const
  }),

  predictionShared: (fid: number, predictionTitle: string, shareType: string) => ({
    fid,
    title: "📤 Prediction Shared!",
    body: `You shared your prediction "${predictionTitle}" as ${shareType} on Farcaster!`,
    type: 'prediction_shared' as const
  }),

  predictionResolved: (fid: number, predictionTitle: string, outcome: string, won: boolean) => ({
    fid,
    title: won ? "🏆 You Won!" : "😔 You Lost",
    body: `Prediction "${predictionTitle}" has been resolved as ${outcome}. ${won ? 'Congratulations!' : 'Better luck next time!'}`,
    type: 'prediction_resolved' as const
  }),

  newPrediction: (fid: number, predictionTitle: string, category: string) => ({
    fid,
    title: "🔮 New Prediction!",
    body: `New prediction available in ${category} category: "${predictionTitle}"`,
    type: 'new_prediction' as const
  }),

  achievement: (fid: number, achievementName: string, description: string) => ({
    fid,
    title: "🏆 Achievement Unlocked!",
    body: `Congratulations! You unlocked achievement "${achievementName}": ${description}`,
    type: 'achievement' as const
  }),

  welcome: (fid: number) => ({
    fid,
    title: "👋 Welcome to Swipe!",
    body: "Thank you for joining our prediction platform. Good luck predicting the future!",
    type: 'achievement' as const
  }),

  milestone: (fid: number, milestone: string, count: number) => ({
    fid,
    title: "🎯 Milestone Achieved!",
    body: `Congratulations! You achieved ${milestone}: ${count} predictions`,
    type: 'achievement' as const
  })
};

// Convenience functions
export async function notifyStakeSuccess(fid: number, predictionTitle: string, stakeAmount: string, outcome: string) {
  const notification = notificationTemplates.stakeSuccess(fid, predictionTitle, stakeAmount, outcome);
  return await sendNotificationToUser(notification);
}

export async function notifyStakeFailed(fid: number, predictionTitle: string, reason: string) {
  const notification = notificationTemplates.stakeFailed(fid, predictionTitle, reason);
  return await sendNotificationToUser(notification);
}

export async function notifyPredictionShared(fid: number, predictionTitle: string, shareType: string) {
  const notification = notificationTemplates.predictionShared(fid, predictionTitle, shareType);
  return await sendNotificationToUser(notification);
}

export async function notifyPredictionResolved(fid: number, predictionTitle: string, outcome: string, won: boolean) {
  const notification = notificationTemplates.predictionResolved(fid, predictionTitle, outcome, won);
  return await sendNotificationToUser(notification);
}

export async function notifyNewPrediction(fid: number, predictionTitle: string, category: string) {
  const notification = notificationTemplates.newPrediction(fid, predictionTitle, category);
  return await sendNotificationToUser(notification);
}

export async function notifyAchievement(fid: number, achievementName: string, description: string) {
  const notification = notificationTemplates.achievement(fid, achievementName, description);
  return await sendNotificationToUser(notification);
}

export async function notifyWelcome(fid: number) {
  const notification = notificationTemplates.welcome(fid);
  return await sendNotificationToUser(notification);
}

export async function notifyMilestone(fid: number, milestone: string, count: number) {
  const notification = notificationTemplates.milestone(fid, milestone, count);
  return await sendNotificationToUser(notification);
}

// Batch notification sender for multiple users
export async function sendBatchNotifications(notifications: NotificationData[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  const promises = notifications.map(async (notification) => {
    const result = await sendNotificationToUser(notification);
    if (result) {
      success++;
    } else {
      failed++;
    }
  });

  await Promise.allSettled(promises);

  return { success, failed };
}
