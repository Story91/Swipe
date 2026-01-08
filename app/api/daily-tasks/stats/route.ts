import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/daily-tasks/stats
 * 
 * Returns global statistics for the daily tasks program.
 * Used for displaying pool info and leaderboards.
 */

export async function GET(request: NextRequest) {
  try {
    const redis = (await import('../../../../lib/redis')).default;
    
    // Get or initialize stats
    const statsKey = 'daily-tasks:stats';
    const stats = await redis.hgetall(statsKey);
    
    // Get leaderboard (top 10 by score, descending)
    const leaderboardKey = 'daily-tasks:leaderboard';
    const topUsers = await redis.zrange(leaderboardKey, 0, 9, { rev: true, withScores: true });
    
    // Parse leaderboard into array
    const leaderboard = [];
    for (const item of topUsers) {
      leaderboard.push({
        address: item.value,
        totalClaimed: item.score,
      });
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: parseInt(stats?.totalUsers || '0'),
        totalClaims: parseInt(stats?.totalClaims || '0'),
        totalDistributed: stats?.totalDistributed || '0',
        avgStreak: parseFloat(stats?.avgStreak || '0'),
        jackpotsHit: parseInt(stats?.jackpotsHit || '0'),
      },
      leaderboard,
    });

  } catch (error) {
    console.error('Daily tasks stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST: Update stats after a claim (called by contract event listener or webhook)
 */
export async function POST(request: NextRequest) {
  try {
    const { address, amount, streak, isJackpot, secret } = await request.json();
    
    // Verify secret (simple auth for internal use)
    if (secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const redis = (await import('../../../../lib/redis')).default;
    
    // Update global stats
    const statsKey = 'daily-tasks:stats';
    await redis.hincrby(statsKey, 'totalClaims', 1);
    await redis.hincrbyfloat(statsKey, 'totalDistributed', parseFloat(amount));
    
    if (isJackpot) {
      await redis.hincrby(statsKey, 'jackpotsHit', 1);
    }

    // Update leaderboard
    const leaderboardKey = 'daily-tasks:leaderboard';
    await redis.zincrby(leaderboardKey, parseFloat(amount), address.toLowerCase());

    // Track unique users
    const usersKey = 'daily-tasks:users';
    const isNew = await redis.sadd(usersKey, address.toLowerCase());
    if (isNew) {
      await redis.hincrby(statsKey, 'totalUsers', 1);
    }

    // Update average streak
    const avgStreak = await redis.hget(statsKey, 'avgStreak') || '0';
    const totalClaims = await redis.hget(statsKey, 'totalClaims') || '1';
    const newAvg = (parseFloat(avgStreak) * (parseInt(totalClaims) - 1) + streak) / parseInt(totalClaims);
    await redis.hset(statsKey, 'avgStreak', newAvg.toString());

    return NextResponse.json({
      success: true,
      message: 'Stats updated',
    });

  } catch (error) {
    console.error('Stats update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

