import type { MiniAppNotificationDetails } from "@farcaster/frame-sdk";
import { redis } from "./redis";

const notificationServiceKey =
  process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "minikit";

function getUserNotificationDetailsKey(fid: number, appFid: number): string {
  // Token is unique for each (Farcaster Client, Mini App, user Fid) tuple
  // So we need to use both fid and appFid as the key
  return `${notificationServiceKey}:user:${fid}:app:${appFid}`;
}

export async function getUserNotificationDetails(
  fid: number,
  appFid: number,
): Promise<MiniAppNotificationDetails | null> {
  console.log('getUserNotificationDetails called for FID:', fid, 'appFid:', appFid);
  
  if (!redis) {
    console.log('Redis not available');
    return null;
  }

  const key = getUserNotificationDetailsKey(fid, appFid);
  console.log('Looking for notification details with key:', key);
  
  const result = await redis.get<MiniAppNotificationDetails>(key);
  console.log('Redis result:', result);
  
  return result;
}

export async function setUserNotificationDetails(
  fid: number,
  appFid: number,
  notificationDetails: MiniAppNotificationDetails,
): Promise<void> {
  if (!redis) {
    return;
  }

  await redis.set(getUserNotificationDetailsKey(fid, appFid), notificationDetails);
}

export async function deleteUserNotificationDetails(
  fid: number,
  appFid: number,
): Promise<void> {
  if (!redis) {
    return;
  }

  await redis.del(getUserNotificationDetailsKey(fid, appFid));
}

/**
 * Get all appFids for a given user fid
 * This is useful when you want to send notifications to all clients where the user has the mini app
 */
export async function getAllAppFidsForUser(
  fid: number,
): Promise<Array<{ appFid: number; notificationDetails: MiniAppNotificationDetails }>> {
  if (!redis) {
    return [];
  }

  try {
    // Search for all keys matching the pattern: {notificationServiceKey}:user:{fid}:app:*
    const pattern = `${notificationServiceKey}:user:${fid}:app:*`;
    const keys = await redis.keys(pattern);
    
    const results: Array<{ appFid: number; notificationDetails: MiniAppNotificationDetails }> = [];
    
    for (const key of keys) {
      // Extract appFid from key: {notificationServiceKey}:user:{fid}:app:{appFid}
      const match = key.match(new RegExp(`${notificationServiceKey}:user:${fid}:app:(\\d+)`));
      if (match && match[1]) {
        const appFid = parseInt(match[1], 10);
        const notificationDetails = await redis.get<MiniAppNotificationDetails>(key);
        if (notificationDetails) {
          results.push({ appFid, notificationDetails });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error getting all appFids for user:', error);
    return [];
  }
}

/**
 * Get all FIDs of users who have enabled notifications
 * Returns unique FIDs (one per user, regardless of how many clients they use)
 */
export async function getAllUsersWithNotifications(): Promise<number[]> {
  if (!redis) {
    return [];
  }

  try {
    // Search for all keys matching the pattern: {notificationServiceKey}:user:*:app:*
    const pattern = `${notificationServiceKey}:user:*:app:*`;
    const keys = await redis.keys(pattern);
    
    const fids = new Set<number>();
    
    for (const key of keys) {
      // Extract fid from key: {notificationServiceKey}:user:{fid}:app:{appFid}
      const match = key.match(new RegExp(`${notificationServiceKey}:user:(\\d+):app:\\d+`));
      if (match && match[1]) {
        const fid = parseInt(match[1], 10);
        fids.add(fid);
      }
    }
    
    return Array.from(fids);
  } catch (error) {
    console.error('Error getting all users with notifications:', error);
    return [];
  }
}
