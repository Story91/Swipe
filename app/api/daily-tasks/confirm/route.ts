import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/daily-tasks/confirm
 * Called AFTER successful on-chain transaction to mark task as completed in Redis
 */

interface ConfirmTaskRequest {
  address: string;
  taskType: string;
  txHash: string; // Transaction hash as proof
}

export async function POST(request: NextRequest) {
  try {
    const body: ConfirmTaskRequest = await request.json();
    const { address, taskType, txHash } = body;

    // Validate required fields
    if (!address || !taskType || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: address, taskType, txHash' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Validate txHash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction hash' },
        { status: 400 }
      );
    }

    const redis = (await import('../../../../lib/redis')).default;
    const today = new Date().toISOString().split('T')[0];

    // Determine if this is an achievement or daily task
    const isAchievement = ['BETA_TESTER', 'FOLLOW_SOCIALS', 'STREAK_7', 'STREAK_30'].includes(taskType);

    // Build the Redis key
    const taskKey = isAchievement
      ? `achievements:${address.toLowerCase()}:${taskType}`
      : `daily-tasks:${address.toLowerCase()}:${taskType}:${today}`;

    // Check if already confirmed (prevent double counting)
    const alreadyConfirmed = await redis.get(taskKey);
    if (alreadyConfirmed) {
      return NextResponse.json({
        success: true,
        message: 'Task already confirmed',
        alreadyConfirmed: true,
      });
    }

    // Mark task/achievement as completed
    if (isAchievement) {
      // Achievements are permanent (no expiry)
      await redis.set(taskKey, `completed:${txHash}`);
    } else {
      // Daily tasks expire at midnight
      const secondsUntilMidnight = getSecondsUntilMidnight();
      await redis.set(taskKey, `completed:${txHash}`, { ex: secondsUntilMidnight });
    }

    // Track completion in stats
    await redis.hincrby('daily-tasks:stats', `${taskType}:completions`, 1);

    // Also track unique users
    await redis.sadd('daily-tasks:unique-users', address.toLowerCase());

    console.log(`✅ Task confirmed: ${taskType} for ${address} (tx: ${txHash})`);

    return NextResponse.json({
      success: true,
      message: 'Task confirmed successfully',
      taskType,
      address,
      txHash,
    });

  } catch (error) {
    console.error('Task confirmation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get seconds until midnight UTC
 */
function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

