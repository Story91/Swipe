import type { MiniAppNotificationDetails } from "@farcaster/frame-sdk";
import { redis } from "./redis";

const notificationServiceKey =
  process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "minikit";

// Base app FID = 309857 (from Base docs)
function getUserNotificationDetailsKey(fid: number, appFid: number): string {
  return `${notificationServiceKey}:user:${fid}:${appFid}`;
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
