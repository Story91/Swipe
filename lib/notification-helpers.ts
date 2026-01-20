import { sendFrameNotification } from "./notification-client";

export interface NotificationData {
  fid: number;
  title: string;
  body: string;
  type?: 'bet_success' | 'bet_failed' | 'winnings_claimed' | 'prediction_shared' | 'prediction_resolved' | 'new_prediction' | 'achievement' | 'daily_task';
}

// Helper function to send notification via API
export async function sendNotificationToUser(data: NotificationData): Promise<boolean> {
  try {
    console.log('📨 Sending notification to user:', data);
    
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();
    console.log('📨 Notification API response:', response.status, responseData);

    // Check if response is OK AND actually succeeded
    if (!response.ok) {
      console.error('❌ Notification API returned error:', responseData);
      return false;
    }

    // Check if notifications were actually sent successfully
    if (responseData.success !== false && responseData.stats) {
      const { success, total, failed } = responseData.stats;
      if (success > 0) {
        console.log(`✅ Notification sent successfully: ${success}/${total} succeeded`);
        return true;
      } else {
        console.error(`❌ Notification failed: ${failed}/${total} failed`, responseData.errors || responseData.details);
        return false;
      }
    }

    // Fallback: if response is OK, assume success
    return response.ok;
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    return false;
  }
}

// Predefined notification templates
export const notificationTemplates = {
  betSuccess: (fid: number, predictionTitle: string, betAmount: string, outcome: string, token: string = 'ETH') => ({
    fid,
    title: "✅ Bet Placed!",
    body: `Your ${betAmount} ${token} bet on "${predictionTitle}" is live! Prediction: ${outcome}. Complete daily tasks to earn free $SWIPE! 🎁`,
    type: 'bet_success' as const
  }),

  betFailed: (fid: number, predictionTitle: string, reason: string) => ({
    fid,
    title: "❌ Bet Failed",
    body: `Couldn't place bet on "${predictionTitle}". ${reason}. Try again or complete daily tasks for free $SWIPE! 💰`,
    type: 'bet_failed' as const
  }),

  winningsClaimed: (fid: number, predictionTitle: string, amount: string, token: string = 'ETH') => ({
    fid,
    title: "💰 Winnings Claimed!",
    body: `You claimed ${amount} ${token} from "${predictionTitle}"! Keep betting and complete daily tasks for more $SWIPE rewards! 🎁`,
    type: 'winnings_claimed' as const
  }),

  predictionShared: (fid: number, predictionTitle: string, shareType: string) => ({
    fid,
    title: "📤 Prediction Shared!",
    body: `You shared "${predictionTitle}" on Farcaster! Share more to earn free $SWIPE rewards. Complete daily tasks! 💰`,
    type: 'prediction_shared' as const
  }),

  predictionResolved: (fid: number, predictionTitle: string, outcome: string, won: boolean) => ({
    fid,
    title: won ? "🎉 You Won!" : "💪 Try Again!",
    body: won 
      ? `"${predictionTitle}" resolved as ${outcome} - you won! Claim your winnings and earn more free $SWIPE with daily tasks! 🎁`
      : `"${predictionTitle}" resolved as ${outcome}. Don't give up! Complete daily tasks for free $SWIPE and keep betting! 💰`,
    type: 'prediction_resolved' as const
  }),

  newPrediction: (fid: number, predictionTitle: string, category: string) => ({
    fid,
    title: "🔮 New Prediction!",
    body: `New prediction in ${category}: "${predictionTitle}". Place your bet now! Complete daily tasks for free $SWIPE! 💰`,
    type: 'new_prediction' as const
  }),

  achievement: (fid: number, achievementName: string, description: string) => ({
    fid,
    title: "🏆 Achievement Unlocked!",
    body: `"${achievementName}": ${description}. Keep going to earn more free $SWIPE with daily tasks! 🎁`,
    type: 'achievement' as const
  }),

  welcome: (fid: number) => ({
    fid,
    title: "👋 Welcome to Swipe!",
    body: "Start predicting and earn free $SWIPE rewards! Complete daily tasks to unlock more rewards. Let's go! 🚀",
    type: 'achievement' as const
  }),

  milestone: (fid: number, milestone: string, count: number) => ({
    fid,
    title: "🎯 Milestone Achieved!",
    body: `You reached ${milestone}: ${count} predictions! Earn even more free $SWIPE with daily tasks! 💰`,
    type: 'achievement' as const
  }),

  dailyTaskReminder: (fid: number, taskName: string) => ({
    fid,
    title: "⏰ Daily Task Available!",
    body: `Complete "${taskName}" to earn free $SWIPE! Daily tasks reset soon - claim your rewards now! 🎁`,
    type: 'daily_task' as const
  }),

  dailyTaskCompleted: (fid: number, reward: string) => ({
    fid,
    title: "🎁 Daily Task Complete!",
    body: `You earned ${reward} $SWIPE! Complete more daily tasks for bigger rewards. Keep going! 💰`,
    type: 'daily_task' as const
  })
};

// Convenience functions
export async function notifyBetSuccess(fid: number, predictionTitle: string, betAmount: string, outcome: string, token: string = 'ETH') {
  const notification = notificationTemplates.betSuccess(fid, predictionTitle, betAmount, outcome, token);
  return await sendNotificationToUser(notification);
}

// Backward compatibility - keep old function names for existing code
export async function notifyStakeSuccess(fid: number, predictionTitle: string, stakeAmount: string, outcome: string, token: string = 'ETH') {
  return notifyBetSuccess(fid, predictionTitle, stakeAmount, outcome, token);
}

export async function notifyBetFailed(fid: number, predictionTitle: string, reason: string) {
  const notification = notificationTemplates.betFailed(fid, predictionTitle, reason);
  return await sendNotificationToUser(notification);
}

// Backward compatibility - keep old function names for existing code
export async function notifyStakeFailed(fid: number, predictionTitle: string, reason: string) {
  return notifyBetFailed(fid, predictionTitle, reason);
}

export async function notifyWinningsClaimed(fid: number, predictionTitle: string, amount: string, token: string = 'ETH') {
  const notification = notificationTemplates.winningsClaimed(fid, predictionTitle, amount, token);
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

export async function notifyDailyTaskReminder(fid: number, taskName: string) {
  const notification = notificationTemplates.dailyTaskReminder(fid, taskName);
  return await sendNotificationToUser(notification);
}

export async function notifyDailyTaskCompleted(fid: number, reward: string) {
  const notification = notificationTemplates.dailyTaskCompleted(fid, reward);
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
