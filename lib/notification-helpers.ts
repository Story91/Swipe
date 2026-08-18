import { sendFrameNotification } from "./notification-client";

export interface NotificationData {
  fid: number;
  title: string;
  body: string;
  type?: 'bet_success' | 'bet_failed' | 'winnings_claimed' | 'prediction_shared' | 'prediction_resolved' | 'new_prediction' | 'achievement' | 'daily_task';
}

/**
 * Format large numbers to K/M format for better readability
 * Examples: 1000 -> "1K", 1500000 -> "1.5M", 500 -> "500"
 */
function formatNumberCompact(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (!Number.isFinite(num)) {
    return String(amount);
  }
  
  if (num >= 1000000) {
    const millions = num / 1000000;
    return millions.toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    const thousands = num / 1000;
    return thousands.toFixed(0) + 'K';
  }
  return num.toLocaleString();
}

/**
 * SWIPE amounts run to millions and are shown compact. A stablecoin amount is
 * shown as it was typed, because "1.2M USDC" and "1200000 USDC" are the same
 * number but only one of them is a bet somebody placed.
 */
function formatTokenAmountForNotification(amount: string | number, token: string): string {
  if (token.toUpperCase() === 'SWIPE') {
    return formatNumberCompact(amount);
  }
  return String(amount);
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
/**
 * What a push notification is allowed to say.
 *
 * Every one of these used to end in a pitch for free $SWIPE from daily tasks.
 * There is no daily task that pays $SWIPE, and the token is not live, so the
 * app was sending users a promise it cannot keep, on every bet, every share and
 * every settlement. A notification is the one surface a user cannot mute
 * selectively and cannot check against the screen, which makes it the worst
 * place in the product to be loose.
 *
 * The token also defaulted to ETH. ETH bets only exist on the archived
 * contracts nobody can settle, so a stablecoin bet whose caller forgot the
 * argument was announced in the wrong currency. There is no default now.
 */
export const notificationTemplates = {
  betSuccess: (fid: number, predictionTitle: string, betAmount: string, outcome: string, token: string) => {
    const formattedAmount = formatTokenAmountForNotification(betAmount, token);
    return {
      fid,
      title: 'Bet placed',
      body: `${formattedAmount} ${token} on ${outcome} in "${predictionTitle}". You can exit early until the deadline.`,
      type: 'bet_success' as const
    };
  },

  betFailed: (fid: number, predictionTitle: string, reason: string) => ({
    fid,
    title: 'Bet did not go through',
    body: `Nothing was staked on "${predictionTitle}". ${reason}`,
    type: 'bet_failed' as const
  }),

  winningsClaimed: (fid: number, predictionTitle: string, amount: string, token: string) => {
    const formattedAmount = formatTokenAmountForNotification(amount, token);
    return {
      fid,
      title: 'Winnings claimed',
      body: `${formattedAmount} ${token} from "${predictionTitle}" is in your wallet.`,
      type: 'winnings_claimed' as const
    };
  },

  predictionShared: (fid: number, predictionTitle: string, shareType: string) => ({
    fid,
    title: 'Shared',
    body: `"${predictionTitle}" is on your feed.`,
    type: 'prediction_shared' as const
  }),

  predictionResolved: (fid: number, predictionTitle: string, outcome: string, won: boolean) => ({
    fid,
    title: won ? 'You called it' : 'Settled',
    body: won
      ? `"${predictionTitle}" settled ${outcome}. Your payout is waiting, claim it whenever, it does not expire.`
      : `"${predictionTitle}" settled ${outcome}, so this one went to the other side.`,
    type: 'prediction_resolved' as const
  }),

  newPrediction: (fid: number, predictionTitle: string, category: string) => ({
    fid,
    title: `New in ${category}`,
    body: `"${predictionTitle}" just opened. Betting early counts for a larger share.`,
    type: 'new_prediction' as const
  }),

  achievement: (fid: number, achievementName: string, description: string) => ({
    fid,
    title: achievementName,
    body: description,
    type: 'achievement' as const
  }),

  welcome: (fid: number) => ({
    fid,
    title: 'Welcome to Swipe',
    body: 'Right for yes, left for no. Winners split what the losing side staked, and the fees come out of that side, never yours.',
    type: 'achievement' as const
  }),

  milestone: (fid: number, milestone: string, count: number) => ({
    fid,
    title: milestone,
    body: `${count} predictions in.`,
    type: 'achievement' as const
  }),

  /**
   * Kept because the daily tasks screen exists, with no reward named. It said a
   * task pays $SWIPE, which is not a thing the app can do today.
   */
  dailyTaskReminder: (fid: number, taskName: string) => ({
    fid,
    title: 'Daily task waiting',
    body: `"${taskName}" resets at midnight UTC.`,
    type: 'daily_task' as const
  }),

  dailyTaskCompleted: (fid: number, reward: string) => ({
    fid,
    title: 'Daily task done',
    body: `"${reward}" is checked off.`,
    type: 'daily_task' as const
  })
};

// Convenience functions
export async function notifyBetSuccess(fid: number, predictionTitle: string, betAmount: string, outcome: string, token: string) {
  const notification = notificationTemplates.betSuccess(fid, predictionTitle, betAmount, outcome, token);
  return await sendNotificationToUser(notification);
}

// Backward compatibility - keep old function names for existing code
export async function notifyStakeSuccess(fid: number, predictionTitle: string, stakeAmount: string, outcome: string, token: string) {
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

export async function notifyWinningsClaimed(fid: number, predictionTitle: string, amount: string, token: string) {
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
