import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/daily-tasks/admin/clean-achievement
 * Completely clean all Redis data for a specific achievement (useful for fixing incorrect data)
 * 
 * Body: { taskType: 'BETA_TESTER' }
 * 
 * This will delete:
 * - All achievement keys: achievements:*:BETA_TESTER
 * - All timestamp keys: achievements:*:BETA_TESTER:timestamp
 * - The users set: achievements:BETA_TESTER:users
 * - The completion counter: daily-tasks:stats BETA_TESTER:completions
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskType } = body;

    if (!taskType) {
      return NextResponse.json(
        { success: false, error: 'Missing taskType' },
        { status: 400 }
      );
    }

    const validAchievements = ['BETA_TESTER', 'FOLLOW_SOCIALS', 'STREAK_7', 'STREAK_30'];
    if (!validAchievements.includes(taskType)) {
      return NextResponse.json(
        { success: false, error: `Invalid achievement type. Must be one of: ${validAchievements.join(', ')}` },
        { status: 400 }
      );
    }

    const redis = (await import('../../../../../lib/redis')).default;
    
    // Get all achievement keys for this task type
    const pattern = `achievements:*:${taskType}`;
    const keys = await redis.keys(pattern);
    
    // Get all timestamp keys
    const timestampPattern = `achievements:*:${taskType}:timestamp`;
    const timestampKeys = await redis.keys(timestampPattern);
    
    // Count items before deletion
    const usersSetKey = `achievements:${taskType}:users`;
    const usersFromSet = await redis.smembers(usersSetKey);
    const usersSetCount = usersFromSet.length;
    
    const statsKey = 'daily-tasks:stats';
    const completionsValue = await redis.hget(statsKey, `${taskType}:completions`);
    const completionsBefore = typeof completionsValue === 'string' ? parseInt(completionsValue) : 0;
    
    // Delete all achievement keys
    let deletedKeys = 0;
    if (keys.length > 0) {
      await redis.del(...keys);
      deletedKeys = keys.length;
    }
    
    // Delete all timestamp keys
    let deletedTimestamps = 0;
    if (timestampKeys.length > 0) {
      await redis.del(...timestampKeys);
      deletedTimestamps = timestampKeys.length;
    }
    
    // Delete users set
    let deletedUsersSet = false;
    if (usersSetCount > 0) {
      await redis.del(usersSetKey);
      deletedUsersSet = true;
    }
    
    // Reset completion counter
    await redis.hset(statsKey, { [`${taskType}:completions`]: '0' });
    
    // Verify deletion
    const remainingKeys = await redis.keys(pattern);
    const remainingTimestamps = await redis.keys(timestampPattern);
    const remainingUsers = await redis.smembers(usersSetKey);
    const completionsAfter = await redis.hget(statsKey, `${taskType}:completions`) || '0';
    
    console.log(`🧹 Cleaned ${taskType} achievement data:`);
    console.log(`   - Deleted ${deletedKeys} achievement keys`);
    console.log(`   - Deleted ${deletedTimestamps} timestamp keys`);
    console.log(`   - Deleted users set (${usersSetCount} users)`);
    console.log(`   - Reset completions counter from ${completionsBefore} to 0`);
    
    return NextResponse.json({
      success: true,
      taskType,
      deleted: {
        achievementKeys: deletedKeys,
        timestampKeys: deletedTimestamps,
        usersSet: deletedUsersSet,
        usersInSet: usersSetCount,
      },
      before: {
        completions: completionsBefore,
        achievementKeys: keys.length,
        timestampKeys: timestampKeys.length,
        usersInSet: usersSetCount,
      },
      after: {
        completions: parseInt(completionsAfter),
        remainingKeys: remainingKeys.length,
        remainingTimestamps: remainingTimestamps.length,
        remainingUsers: remainingUsers.length,
      },
      message: `✅ Successfully cleaned all ${taskType} achievement data from Redis`,
    });

  } catch (error) {
    console.error('Clean achievement error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

