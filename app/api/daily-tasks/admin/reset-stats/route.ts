import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/daily-tasks/admin/reset-stats
 * Reset completion counter for a specific task/achievement
 * 
 * Body: { taskType: 'BETA_TESTER', resetUsers?: boolean }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskType, resetUsers } = body;

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
    const statsKey = 'daily-tasks:stats';

    // Get current stats before reset
    const currentCompletionsValue = await redis.hget(statsKey, `${taskType}:completions`);
    const currentCompletions = typeof currentCompletionsValue === 'string' ? currentCompletionsValue : '0';
    
    // Count actual users who claimed the achievement
    const pattern = `achievements:*:${taskType}`;
    const keys = await redis.keys(pattern);
    const actualUsers = keys.length;

    // Reset the counter to 0
    await redis.hset(statsKey, { [`${taskType}:completions`]: '0' });

    // Optionally reset the users set (if requested)
    let usersSetReset = false;
    if (resetUsers) {
      const usersSetKey = `achievements:${taskType}:users`;
      const usersInSet = await redis.smembers(usersSetKey);
      if (usersInSet.length > 0) {
        await redis.del(usersSetKey);
        usersSetReset = true;
      }
    }

    // Verify the reset
    const newCompletionsValue = await redis.hget(statsKey, `${taskType}:completions`);
    const newCompletions = typeof newCompletionsValue === 'string' ? newCompletionsValue : '0';

    console.log(`✅ Reset ${taskType}:completions from ${currentCompletions} to ${newCompletions}`);

    return NextResponse.json({
      success: true,
      taskType,
      stats: {
        before: parseInt(currentCompletions) || 0,
        after: parseInt(newCompletions) || 0,
        actualUsers,
      },
      usersSetReset,
      message: `Counter reset from ${currentCompletions} to 0. ${actualUsers} actual achievement records remain.`,
    });

  } catch (error) {
    console.error('Reset stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

