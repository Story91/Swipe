import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/daily-tasks/admin/list-achievements
 * List all users who claimed a specific achievement (e.g., BETA_TESTER)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskType = searchParams.get('taskType') || 'BETA_TESTER';

    // Validate task type
    const validAchievements = ['BETA_TESTER', 'FOLLOW_SOCIALS', 'STREAK_7', 'STREAK_30'];
    if (!validAchievements.includes(taskType)) {
      return NextResponse.json(
        { success: false, error: `Invalid achievement type. Must be one of: ${validAchievements.join(', ')}` },
        { status: 400 }
      );
    }

    const redis = (await import('../../../../../lib/redis')).default;

    // Method 1: Get all achievement keys for this task type
    const pattern = `achievements:*:${taskType}`;
    const keys = await redis.keys(pattern);

    // Method 2: Also check the users set (if exists, more reliable)
    const usersSetKey = `achievements:${taskType}:users`;
    const usersFromSet = await redis.smembers(usersSetKey);

    // Extract addresses and transaction hashes
    const usersMap = new Map<string, { address: string; txHash: string; claimedAt?: string }>();

    // Process keys from pattern search
    for (const key of keys) {
      const value = await redis.get(key);
      if (value && typeof value === 'string') {
        // Extract address from key: achievements:0x123...:BETA_TESTER
        const address = key.split(':')[1];
        
        // Extract txHash from value: completed:0xabc...
        const txHash = value.replace('completed:', '');
        
        // Try to get timestamp if stored separately
        let claimedAt: string | undefined;
        try {
          const timestampKey = `achievements:${address}:${taskType}:timestamp`;
          const timestampValue = await redis.get(timestampKey);
          claimedAt = typeof timestampValue === 'string' ? timestampValue : undefined;
        } catch {
          // Timestamp not stored, that's OK
        }

        usersMap.set(address.toLowerCase(), {
          address,
          txHash,
          claimedAt,
        });
      }
    }

    // Add any users from set that might be missing from keys
    for (const address of usersFromSet) {
      if (!usersMap.has(address.toLowerCase())) {
        // User is in set but no key found - might be orphaned or key expired
        const taskKey = `achievements:${address}:${taskType}`;
        const value = await redis.get(taskKey);
        const txHash = (value && typeof value === 'string') ? value.replace('completed:', '') : 'unknown';
        
        let claimedAt: string | undefined;
        try {
          const timestampKey = `achievements:${address}:${taskType}:timestamp`;
          const timestampValue = await redis.get(timestampKey);
          claimedAt = typeof timestampValue === 'string' ? timestampValue : undefined;
        } catch {
          // Timestamp not stored
        }

        usersMap.set(address.toLowerCase(), {
          address,
          txHash,
          claimedAt,
        });
      }
    }

    const users = Array.from(usersMap.values());

    // Get stats
    const completionsValue = await redis.hget('daily-tasks:stats', `${taskType}:completions`);
    const completions = typeof completionsValue === 'string' ? completionsValue : '0';
    const uniqueUsers = users.length;
    const usersFromSetCount = usersFromSet.length;

    // Check if stats match actual users
    const completionsNum = parseInt(completions) || 0;
    const statsMatch = completionsNum === uniqueUsers;
    const setMatch = usersFromSetCount === uniqueUsers;

    return NextResponse.json({
      success: true,
      taskType,
      stats: {
        completions: completionsNum,
        uniqueUsers,
        usersFromSet: usersFromSetCount,
        statsMatch,
        setMatch,
      },
      users: users.sort((a, b) => {
        // Sort by claimedAt if available, otherwise by address
        if (a.claimedAt && b.claimedAt) {
          return new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime();
        }
        return a.address.localeCompare(b.address);
      }),
      note: statsMatch && setMatch
        ? '✅ Stats match actual users and set'
        : statsMatch
        ? `⚠️ Stats match (${completions}) but set has ${usersFromSetCount} users (expected ${uniqueUsers})`
        : setMatch
        ? `⚠️ Set matches (${usersFromSetCount}) but stats show ${completions} completions (expected ${uniqueUsers})`
        : `⚠️ WARNING: Stats show ${completions} completions, set has ${usersFromSetCount} users, but only ${uniqueUsers} unique users found! Possible duplicate counting issue.`,
    });

  } catch (error) {
    console.error('List achievements error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

