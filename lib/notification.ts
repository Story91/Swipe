import type { MiniAppNotificationDetails } from "@farcaster/frame-sdk";
import { redis } from "./redis";

const notificationServiceKey =
  process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "minikit";

function getUserNotificationDetailsKey(fid: number, appFid: number): string {
  // Token is unique for each (Farcaster Client, Mini App, user Fid) tuple
  // So we need to use both fid and appFid as the key
  return `${notificationServiceKey}:user:${fid}:app:${appFid}`;
}

function getUserNotificationDetailsKeyOld(fid: number): string {
  // Old format without appFid (for backward compatibility)
  return `${notificationServiceKey}:user:${fid}`;
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

  // First try new format with appFid
  const newKey = getUserNotificationDetailsKey(fid, appFid);
  console.log('Looking for notification details with new key:', newKey);
  let result = await redis.get<MiniAppNotificationDetails>(newKey);
  
  // If not found, try old format (backward compatibility)
  if (!result) {
    const oldKey = getUserNotificationDetailsKeyOld(fid);
    console.log('Not found in new format, trying old key:', oldKey);
    result = await redis.get<MiniAppNotificationDetails>(oldKey);
    
    // If found in old format, migrate to new format
    if (result) {
      console.log('Found in old format, migrating to new format...');
      await setUserNotificationDetails(fid, appFid, result);
      // Optionally delete old key (uncomment if you want to clean up)
      // await redis.del(oldKey);
    }
  }
  
  console.log('Redis result:', result ? 'Found' : 'Not found');
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
    const results: Array<{ appFid: number; notificationDetails: MiniAppNotificationDetails }> = [];
    
    // Search for new format: {notificationServiceKey}:user:{fid}:app:*
    const newPattern = `${notificationServiceKey}:user:${fid}:app:*`;
    const newKeys = await redis.keys(newPattern);
    
    for (const key of newKeys) {
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
    
    // Also check old format: {notificationServiceKey}:user:{fid} (without :app:)
    const oldKey = getUserNotificationDetailsKeyOld(fid);
    const oldData = await redis.get<MiniAppNotificationDetails>(oldKey);
    
    if (oldData && typeof oldData === 'object' && 'url' in oldData && 'token' in oldData) {
      // Found in old format - use appFid 0 as default (or try to detect from context)
      // For old format, we don't know appFid, so we'll use 0 or try Base app FID (309857)
      const defaultAppFid = 309857; // Base app FID
      results.push({ appFid: defaultAppFid, notificationDetails: oldData });
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
    const fids = new Set<number>();
    
    // Search for new format: {notificationServiceKey}:user:*:app:*
    const newPattern = `${notificationServiceKey}:user:*:app:*`;
    const newKeys = await redis.keys(newPattern);
    
    for (const key of newKeys) {
      // Extract fid from key: {notificationServiceKey}:user:{fid}:app:{appFid}
      const match = key.match(new RegExp(`${notificationServiceKey}:user:(\\d+):app:\\d+`));
      if (match && match[1]) {
        const fid = parseInt(match[1], 10);
        fids.add(fid);
      }
    }
    
    // Also search for old format: {notificationServiceKey}:user:* (without :app:)
    const oldPattern = `${notificationServiceKey}:user:*`;
    const oldKeys = await redis.keys(oldPattern);
    
    for (const key of oldKeys) {
      // Skip keys that have :app: (already counted above)
      if (key.includes(":app:")) continue;
      
      // Extract fid from key: {notificationServiceKey}:user:{fid}
      const match = key.match(new RegExp(`${notificationServiceKey}:user:(\\d+)`));
      if (match && match[1]) {
        // Check if it's actually a notification token (has url and token)
        const data = await redis.get(key);
        if (data && typeof data === 'object' && 'url' in data && 'token' in data) {
          const fid = parseInt(match[1], 10);
          fids.add(fid);
        }
      }
    }
    
    return Array.from(fids);
  } catch (error) {
    console.error('Error getting all users with notifications:', error);
    return [];
  }
}
